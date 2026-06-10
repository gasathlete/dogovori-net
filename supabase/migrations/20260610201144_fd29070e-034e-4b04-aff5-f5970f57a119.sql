
-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) legal_sources — catalog of normative acts
CREATE TABLE IF NOT EXISTS public.legal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('code','act','regulation','directive','ordinance','case_law','constitution')),
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('BG','EU')),
  short_code text NOT NULL,
  title text NOT NULL,
  issuer text,
  official_url text,
  language text NOT NULL DEFAULT 'bg',
  current_version text,
  published_at date,
  last_indexed_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, short_code)
);

GRANT SELECT ON public.legal_sources TO anon, authenticated;
GRANT ALL ON public.legal_sources TO service_role;
ALTER TABLE public.legal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_sources public read" ON public.legal_sources FOR SELECT USING (true);
CREATE POLICY "legal_sources service write" ON public.legal_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_legal_sources_updated_at BEFORE UPDATE ON public.legal_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) legal_documents — versioned full text per source
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.legal_sources(id) ON DELETE CASCADE,
  version text NOT NULL,
  effective_from date,
  effective_to date,
  language text NOT NULL DEFAULT 'bg',
  raw_text text NOT NULL,
  checksum text NOT NULL,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, version)
);

GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_documents public read" ON public.legal_documents FOR SELECT USING (true);
CREATE POLICY "legal_documents service write" ON public.legal_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) legal_chunks — embedded passages with article-level granularity
CREATE TABLE IF NOT EXISTS public.legal_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.legal_sources(id) ON DELETE CASCADE,
  article_no text,
  paragraph_no text,
  heading_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  citation_label text NOT NULL,
  content text NOT NULL,
  content_tsv tsvector,
  embedding vector(768),
  token_count integer,
  chunk_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legal_chunks TO anon, authenticated;
GRANT ALL ON public.legal_chunks TO service_role;
ALTER TABLE public.legal_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_chunks public read" ON public.legal_chunks FOR SELECT USING (true);
CREATE POLICY "legal_chunks service write" ON public.legal_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS legal_chunks_embedding_idx
  ON public.legal_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS legal_chunks_tsv_idx
  ON public.legal_chunks USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS legal_chunks_source_idx
  ON public.legal_chunks (source_id);

-- tsvector trigger (simple FTS with unaccent for Cyrillic-friendly matching)
CREATE OR REPLACE FUNCTION public.legal_chunks_refresh_tsv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.content_tsv :=
       setweight(to_tsvector('simple', unaccent(coalesce(NEW.citation_label,''))), 'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(NEW.content,''))), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_chunks_tsv
  BEFORE INSERT OR UPDATE OF content, citation_label ON public.legal_chunks
  FOR EACH ROW EXECUTE FUNCTION public.legal_chunks_refresh_tsv();

-- 5) Hybrid retrieval RPC: cosine + ts_rank fused via reciprocal rank fusion
CREATE OR REPLACE FUNCTION public.match_legal_chunks(
  query_embedding vector(768),
  query_text text DEFAULT NULL,
  jurisdictions text[] DEFAULT NULL,
  source_types text[] DEFAULT NULL,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  document_id uuid,
  citation_label text,
  content text,
  article_no text,
  paragraph_no text,
  source_short_code text,
  source_title text,
  official_url text,
  jurisdiction text,
  similarity double precision,
  text_rank double precision,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT CASE
      WHEN query_text IS NULL OR length(trim(query_text)) = 0 THEN NULL
      ELSE plainto_tsquery('simple', unaccent(query_text))
    END AS tsq
  ),
  vec AS (
    SELECT c.id,
           1 - (c.embedding <=> query_embedding) AS similarity,
           row_number() OVER (ORDER BY c.embedding <=> query_embedding) AS rnk
    FROM public.legal_chunks c
    JOIN public.legal_sources s ON s.id = c.source_id
    WHERE s.active
      AND (jurisdictions IS NULL OR s.jurisdiction = ANY(jurisdictions))
      AND (source_types IS NULL OR s.source_type = ANY(source_types))
    ORDER BY c.embedding <=> query_embedding
    LIMIT 30
  ),
  txt AS (
    SELECT c.id,
           ts_rank_cd(c.content_tsv, (SELECT tsq FROM q)) AS text_rank,
           row_number() OVER (ORDER BY ts_rank_cd(c.content_tsv, (SELECT tsq FROM q)) DESC) AS rnk
    FROM public.legal_chunks c
    JOIN public.legal_sources s ON s.id = c.source_id
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND c.content_tsv @@ (SELECT tsq FROM q)
      AND s.active
      AND (jurisdictions IS NULL OR s.jurisdiction = ANY(jurisdictions))
      AND (source_types IS NULL OR s.source_type = ANY(source_types))
    ORDER BY text_rank DESC
    LIMIT 20
  ),
  fused AS (
    SELECT id,
           SUM(weight) AS score,
           MAX(similarity) AS similarity,
           MAX(text_rank) AS text_rank
    FROM (
      SELECT id, 1.0 / (60 + rnk) AS weight, similarity, NULL::double precision AS text_rank FROM vec
      UNION ALL
      SELECT id, 1.0 / (60 + rnk) AS weight, NULL::double precision AS similarity, text_rank FROM txt
    ) u
    GROUP BY id
  )
  SELECT c.id, c.source_id, c.document_id, c.citation_label, c.content,
         c.article_no, c.paragraph_no,
         s.short_code, s.title, s.official_url, s.jurisdiction,
         COALESCE(f.similarity, 0),
         COALESCE(f.text_rank, 0),
         f.score
  FROM fused f
  JOIN public.legal_chunks c ON c.id = f.id
  JOIN public.legal_sources s ON s.id = c.source_id
  ORDER BY f.score DESC
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

GRANT EXECUTE ON FUNCTION public.match_legal_chunks(vector, text, text[], text[], integer) TO anon, authenticated, service_role;
