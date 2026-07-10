DROP POLICY IF EXISTS "user_articles_images_public_read" ON storage.objects;
CREATE POLICY "user_articles_images_public_read_approved"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'user-articles'
    AND EXISTS (
      SELECT 1 FROM public.user_articles ua
      WHERE ua.status = 'approved'
        AND ua.image_url LIKE '%/' || storage.objects.name
    )
  );