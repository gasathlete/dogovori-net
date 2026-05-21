
-- Транслитерация helper (използван в backfill)
CREATE OR REPLACE FUNCTION public.unaccent_or_lower(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(translate(_t,
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯабвгдежзийклмнопрстуфхцчшщъьюя',
    'ABVGDEJZIYKLMNOPRSTUFHCCSS_UYAbvgdejziyklmnoprstufhccss_uya'
  ));
$$;

-- Нова таблица за секции на промптове
CREATE TABLE public.ai_prompt_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  order_idx integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, section_key)
);

CREATE INDEX idx_ai_prompt_sections_prompt ON public.ai_prompt_sections(prompt_id, order_idx);

ALTER TABLE public.ai_prompt_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_prompt_sections_service_role" ON public.ai_prompt_sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_prompt_sections_staff_all" ON public.ai_prompt_sections
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_ai_prompt_sections_updated
  BEFORE UPDATE ON public.ai_prompt_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assemble_prompt_content(_prompt_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT string_agg(
    '# ' || s.title || E'\n' || s.content,
    E'\n\n'
    ORDER BY s.order_idx
  )
  FROM public.ai_prompt_sections s
  WHERE s.prompt_id = _prompt_id AND s.enabled = true;
$$;

-- Backfill — преименувани променливи (v_*) за избягване на конфликт с колоните
DO $$
DECLARE
  p RECORD;
  v_parts text[];
  v_part text;
  v_idx int;
  v_title_line text;
  v_body text;
  v_nl int;
  v_key text;
  v_preamble text;
BEGIN
  FOR p IN SELECT id, content FROM public.ai_prompts LOOP
    v_parts := regexp_split_to_array(E'\n' || p.content, E'\n# ');
    v_idx := 0;
    FOREACH v_part IN ARRAY v_parts LOOP
      IF length(trim(v_part)) = 0 THEN CONTINUE; END IF;

      v_nl := position(E'\n' in v_part);
      IF v_nl > 0 THEN
        v_title_line := trim(substring(v_part from 1 for v_nl - 1));
        v_body := substring(v_part from v_nl + 1);
      ELSE
        v_title_line := trim(v_part);
        v_body := '';
      END IF;

      -- Първа част без заглавие → intro
      IF v_idx = 0 AND v_title_line !~ '^[А-ЯA-Z]' THEN
        v_preamble := trim(v_part);
        IF length(v_preamble) > 0 THEN
          INSERT INTO public.ai_prompt_sections (prompt_id, section_key, title, content, order_idx)
          VALUES (p.id, 'intro', 'Въведение', v_preamble, v_idx)
          ON CONFLICT (prompt_id, section_key) DO NOTHING;
          v_idx := v_idx + 1;
        END IF;
        CONTINUE;
      END IF;

      v_key := public.unaccent_or_lower(v_title_line);
      v_key := lower(regexp_replace(v_key, '[^a-zA-Z0-9]+', '_', 'g'));
      v_key := trim(both '_' from v_key);
      IF length(v_key) = 0 THEN v_key := 'section_' || v_idx; END IF;
      v_key := substring(v_key from 1 for 60);

      INSERT INTO public.ai_prompt_sections (prompt_id, section_key, title, content, order_idx, enabled)
      VALUES (p.id, v_key, v_title_line, rtrim(v_body), v_idx, true)
      ON CONFLICT (prompt_id, section_key) DO UPDATE
        SET title = EXCLUDED.title, content = EXCLUDED.content, order_idx = EXCLUDED.order_idx;

      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
END $$;
