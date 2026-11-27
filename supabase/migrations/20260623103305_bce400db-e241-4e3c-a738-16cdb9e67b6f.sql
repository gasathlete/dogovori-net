
-- 1. blog_comments: add public SELECT (comments on blog posts are public)
CREATE POLICY "blog_comments_public_read"
  ON public.blog_comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2. partner-logos bucket: add public SELECT
CREATE POLICY "partner-logos public read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'partner-logos');

-- 3. realtime: restrict notifications-tab topic to staff; keep per-user topic for everyone
DROP POLICY IF EXISTS "realtime_authenticated_read_own_topics" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_authenticated_write_own_topics" ON realtime.messages;

CREATE POLICY "realtime_authenticated_read_own_topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE ('notifications-unread-' || auth.uid()::text || '%')
    OR (realtime.topic() = 'notifications-tab' AND public.is_staff(auth.uid()))
  );

CREATE POLICY "realtime_authenticated_write_own_topics"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() LIKE ('notifications-unread-' || auth.uid()::text || '%')
    OR (realtime.topic() = 'notifications-tab' AND public.is_staff(auth.uid()))
  );

-- 4. Drop redundant service_role ALL USING(true) policies (service_role bypasses RLS by default)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND qual = 'true'
      AND with_check = 'true'
      AND 'service_role' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
