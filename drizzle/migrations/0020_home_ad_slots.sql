-- Рекламно поле на началната страница: извадки от блога с управляема продължителност.
CREATE TABLE IF NOT EXISTS public.home_ad_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  excerpt TEXT,
  link TEXT NOT NULL,
  image_url TEXT,
  badge TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.home_ad_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_ad_slots TO authenticated;
GRANT ALL ON public.home_ad_slots TO service_role;

ALTER TABLE public.home_ad_slots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public reads live ads" ON public.home_ad_slots
    FOR SELECT TO anon, authenticated
    USING (is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff manage ads" ON public.home_ad_slots
    FOR ALL TO authenticated
    USING (public.is_staff(auth.uid()))
    WITH CHECK (public.is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS home_ad_slots_live_idx
  ON public.home_ad_slots (is_active, starts_at DESC);

-- Само агрегирани посещения на статии от блога, без каквито и да е лични данни.
CREATE OR REPLACE FUNCTION public.top_blog_articles(_limit integer DEFAULT 2)
RETURNS TABLE (path text, views bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pv.path, count(*)::bigint AS views
  FROM public.page_views pv
  WHERE pv.path LIKE '/blog/%'
    AND pv.created_at > now() - interval '180 days'
  GROUP BY pv.path
  ORDER BY count(*) DESC, pv.path ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 2), 1), 12)
$$;

GRANT EXECUTE ON FUNCTION public.top_blog_articles(integer) TO anon, authenticated, service_role;