-- Applied live 2026-09-28 after aggregate preflight.
-- team-assets: one PNG, 650681 bytes; home-testimonials: no objects.
-- These mirror the existing UI caps in TeamBranding.tsx and
-- AdminHomeTestimonials.tsx; direct Storage calls must enforce them too.
-- Privacy, RLS, accepted MIME types and existing objects remain unchanged.
UPDATE storage.buckets
SET file_size_limit = CASE id
  WHEN 'team-assets' THEN 2097152
  ELSE 5242880
END
WHERE id IN ('team-assets','home-testimonials');
