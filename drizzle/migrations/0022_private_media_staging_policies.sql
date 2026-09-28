-- Private staging for unapproved partner logos / article images.
-- No anon policy: pending/rejected media are never publicly readable.
CREATE POLICY "media_pending_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('partner-logos-pending','user-articles-pending')
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp'));
CREATE POLICY "media_pending_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('partner-logos-pending','user-articles-pending')
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid())));