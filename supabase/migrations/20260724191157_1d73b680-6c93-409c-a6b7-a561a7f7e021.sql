
CREATE POLICY "home-testimonials authed upload own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'home-testimonials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "home-testimonials owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'home-testimonials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "home-testimonials staff manage"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'home-testimonials' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'home-testimonials' AND public.is_staff(auth.uid()));
