-- Private staging for unapproved partner logos / article images.
-- No anon policy: pending/rejected media are never publicly readable.
CREATE POLICY "media_pending_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('partner-logos-pending','user-articles-pending')
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp'));
CREATE POLICY "media_pending_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('partner-logos-pending','user-articles-pending')
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid())));

-- Applied 2026-09-28 after aggregate preflight confirmed both pending buckets empty.
-- Mirror the accepted raster types and public destination caps; clients cannot
-- bypass these checks by calling Storage directly or forging an extension.
-- MIME checks are not a substitute for content decoding / malware scanning.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']::text[],
    file_size_limit = CASE id
      WHEN 'partner-logos-pending' THEN 2621440
      ELSE 5242880
    END
WHERE id IN ('partner-logos-pending','user-articles-pending');
