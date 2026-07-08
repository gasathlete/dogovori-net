
-- Tighten partner-logos public read: only files referenced by approved partners are publicly readable.
DROP POLICY IF EXISTS "partner-logos public read" ON storage.objects;

CREATE POLICY "partner-logos public read approved"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'partner-logos'
    AND EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.status = 'approved'
        AND p.logo_url LIKE '%/' || storage.objects.name
    )
  );

-- Align user-articles bucket (public flag) with an explicit public SELECT policy
-- so published article images are readable by visitors as intended.
DROP POLICY IF EXISTS "user_articles_images_public_read" ON storage.objects;

CREATE POLICY "user_articles_images_public_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'user-articles');
