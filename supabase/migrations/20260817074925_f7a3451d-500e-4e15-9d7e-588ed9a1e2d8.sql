DROP POLICY IF EXISTS "partner-logos public read approved" ON storage.objects;
CREATE POLICY "partner-logos public read approved"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'partner-logos'
  AND EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.status = 'approved'
      AND split_part(p.logo_url, '/storage/v1/object/public/partner-logos/', 2) = objects.name
  )
);

DROP POLICY IF EXISTS "user_articles_images_public_read_approved" ON storage.objects;
CREATE POLICY "user_articles_images_public_read_approved"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'user-articles'
  AND EXISTS (
    SELECT 1 FROM public.user_articles ua
    WHERE ua.status = 'approved'::article_status
      AND split_part(ua.image_url, '/storage/v1/object/public/user-articles/', 2) = objects.name
  )
);