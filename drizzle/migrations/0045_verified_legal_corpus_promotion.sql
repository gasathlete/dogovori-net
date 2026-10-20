-- Approved legal corpus promotion compatibility. Existing rows/history and RLS remain.
BEGIN;
ALTER TABLE public.legal_source_registry DROP CONSTRAINT IF EXISTS lsr_authority_tier_chk;
ALTER TABLE public.legal_source_registry ADD CONSTRAINT lsr_authority_tier_chk CHECK (authority_tier = ANY (ARRAY['official_promulgation','official_legislative_process','official_consultation','official_eu_publication','official_eu_consolidated_helper','official_administrative_consolidation']));
ALTER TABLE public.legal_source_registry DROP CONSTRAINT IF EXISTS lsr_parser_version_chk;
ALTER TABLE public.legal_source_registry ADD CONSTRAINT lsr_parser_version_chk CHECK (parser_version ~ '^(v[0-9]{1,4}|law-(html|docx|pdf)-v[0-9]{1,4})$');
ALTER TABLE public.legal_source_snapshots DROP CONSTRAINT IF EXISTS lss_parser_version_chk;
ALTER TABLE public.legal_source_snapshots ADD CONSTRAINT lss_parser_version_chk CHECK (parser_version ~ '^(v[0-9]{1,4}|law-(html|docx|pdf)-v[0-9]{1,4})$');
ALTER TABLE public.legal_source_snapshots DROP CONSTRAINT IF EXISTS lss_source_checksum_uniq;
ALTER TABLE public.legal_source_snapshots DROP CONSTRAINT IF EXISTS lss_source_checksum_parser_uniq;
ALTER TABLE public.legal_source_snapshots ADD CONSTRAINT lss_source_checksum_parser_uniq UNIQUE (source_key,checksum,parser_version);
CREATE OR REPLACE FUNCTION public.match_legal_chunks(query_embedding vector, query_text text DEFAULT NULL::text, jurisdictions text[] DEFAULT NULL::text[], source_types text[] DEFAULT NULL::text[], match_count integer DEFAULT 8, short_codes text[] DEFAULT NULL::text[])
 RETURNS TABLE(chunk_id uuid, source_id uuid, document_id uuid, citation_label text, content text, article_no text, paragraph_no text, source_short_code text, source_title text, official_url text, jurisdiction text, similarity double precision, text_rank double precision, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    JOIN public.legal_documents d ON d.id = c.document_id AND d.source_id = s.id AND d.version = s.current_version
    WHERE s.active
      AND (jurisdictions IS NULL OR s.jurisdiction = ANY(jurisdictions))
      AND (source_types IS NULL OR s.source_type = ANY(source_types))
      AND (short_codes IS NULL OR s.short_code = ANY(short_codes))
    ORDER BY c.embedding <=> query_embedding
    LIMIT 30
  ),
  txt AS (
    SELECT c.id,
           ts_rank_cd(c.content_tsv, (SELECT tsq FROM q)) AS text_rank,
           row_number() OVER (ORDER BY ts_rank_cd(c.content_tsv, (SELECT tsq FROM q)) DESC) AS rnk
    FROM public.legal_chunks c
    JOIN public.legal_sources s ON s.id = c.source_id
    JOIN public.legal_documents d ON d.id = c.document_id AND d.source_id = s.id AND d.version = s.current_version
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND c.content_tsv @@ (SELECT tsq FROM q)
      AND s.active
      AND (jurisdictions IS NULL OR s.jurisdiction = ANY(jurisdictions))
      AND (source_types IS NULL OR s.source_type = ANY(source_types))
      AND (short_codes IS NULL OR s.short_code = ANY(short_codes))
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
    JOIN public.legal_documents d ON d.id = c.document_id AND d.source_id = s.id AND d.version = s.current_version
  ORDER BY f.score DESC
  LIMIT GREATEST(1, LEAST(match_count, 20));
$function$

REVOKE ALL ON FUNCTION public.match_legal_chunks(vector,text,text[],text[],integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_legal_chunks(vector,text,text[],text[],integer,text[]) TO authenticated, service_role;
COMMIT;
