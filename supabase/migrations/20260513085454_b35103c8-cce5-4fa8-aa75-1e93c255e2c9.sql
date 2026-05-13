
-- =========================================
-- USER ARTICLES (potrebitelski statii)
-- =========================================
CREATE TYPE public.article_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.article_source AS ENUM ('user','admin');

CREATE TABLE public.user_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  summary text NOT NULL DEFAULT '',
  meta_description text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  intro text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  takeaways jsonb NOT NULL DEFAULT '[]'::jsonb,
  word_count integer NOT NULL DEFAULT 0,
  source public.article_source NOT NULL DEFAULT 'user',
  status public.article_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_articles_status_idx ON public.user_articles(status, published_at DESC);
CREATE INDEX user_articles_user_idx ON public.user_articles(user_id);

ALTER TABLE public.user_articles ENABLE ROW LEVEL SECURITY;

-- Approved articles are publicly readable.
CREATE POLICY user_articles_public_select ON public.user_articles
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

-- Authors see their own (any status).
CREATE POLICY user_articles_select_own ON public.user_articles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Staff sees everything.
CREATE POLICY user_articles_staff_select ON public.user_articles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Authenticated users can insert their own pending submissions.
CREATE POLICY user_articles_insert_self ON public.user_articles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND source = 'user');

-- Staff can insert anything (used by admin generate flow via service role too).
CREATE POLICY user_articles_insert_staff ON public.user_articles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Staff updates / deletes.
CREATE POLICY user_articles_update_staff ON public.user_articles
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY user_articles_delete_staff ON public.user_articles
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY user_articles_service_role ON public.user_articles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER user_articles_set_updated_at
  BEFORE UPDATE ON public.user_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- BLOG COMMENTS
-- =========================================
CREATE TYPE public.blog_post_type AS ENUM ('core','user');

CREATE TABLE public.blog_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug text NOT NULL,
  post_type public.blog_post_type NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blog_comments_post_idx ON public.blog_comments(post_type, post_slug, created_at DESC);

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_comments_select_all ON public.blog_comments
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY blog_comments_insert_self ON public.blog_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY blog_comments_update_own ON public.blog_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY blog_comments_delete_own ON public.blog_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY blog_comments_delete_staff ON public.blog_comments
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY blog_comments_service_role ON public.blog_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER blog_comments_set_updated_at
  BEFORE UPDATE ON public.blog_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- BLOG RATINGS
-- =========================================
CREATE TABLE public.blog_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug text NOT NULL,
  post_type public.blog_post_type NOT NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_type, post_slug, user_id)
);

CREATE INDEX blog_ratings_post_idx ON public.blog_ratings(post_type, post_slug);

ALTER TABLE public.blog_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_ratings_select_all ON public.blog_ratings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY blog_ratings_insert_self ON public.blog_ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY blog_ratings_update_own ON public.blog_ratings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY blog_ratings_delete_own ON public.blog_ratings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY blog_ratings_service_role ON public.blog_ratings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER blog_ratings_set_updated_at
  BEFORE UPDATE ON public.blog_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- STORAGE BUCKET for user article images
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-articles', 'user-articles', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "user_articles_images_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'user-articles');

CREATE POLICY "user_articles_images_authed_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-articles' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_articles_images_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-articles' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_articles_images_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-articles' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =========================================
-- Helper RPC: aggregate rating for a post
-- =========================================
CREATE OR REPLACE FUNCTION public.get_post_rating(_post_type public.blog_post_type, _post_slug text)
RETURNS TABLE (avg_rating numeric, rating_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(AVG(rating)::numeric(3,2), 0)::numeric AS avg_rating,
         COUNT(*)::integer AS rating_count
  FROM public.blog_ratings
  WHERE post_type = _post_type AND post_slug = _post_slug;
$$;

GRANT EXECUTE ON FUNCTION public.get_post_rating(public.blog_post_type, text) TO anon, authenticated;
