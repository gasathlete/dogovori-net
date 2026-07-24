
CREATE TABLE public.home_testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT,
  quote TEXT NOT NULL,
  rating INT NOT NULL DEFAULT 5,
  photo_url TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_admin_added BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT quote_len CHECK (char_length(quote) BETWEEN 10 AND 600),
  CONSTRAINT name_len CHECK (char_length(name) BETWEEN 2 AND 80)
);

GRANT SELECT, INSERT ON public.home_testimonials TO authenticated;
GRANT SELECT ON public.home_testimonials TO anon;
GRANT ALL ON public.home_testimonials TO service_role;

ALTER TABLE public.home_testimonials ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved testimonials (for homepage)
CREATE POLICY "public read approved testimonials"
ON public.home_testimonials
FOR SELECT
USING (is_approved = true);

-- Authenticated users can view their own submissions
CREATE POLICY "users read own testimonials"
ON public.home_testimonials
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Staff can read all
CREATE POLICY "staff read all testimonials"
ON public.home_testimonials
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Authenticated users can insert their own review (unapproved by default)
CREATE POLICY "users insert own testimonials"
ON public.home_testimonials
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_approved = false
  AND is_admin_added = false
);

-- Staff can insert any (admin-added)
CREATE POLICY "staff insert testimonials"
ON public.home_testimonials
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

-- Staff can update
CREATE POLICY "staff update testimonials"
ON public.home_testimonials
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Staff can delete
CREATE POLICY "staff delete testimonials"
ON public.home_testimonials
FOR DELETE
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE TRIGGER trg_home_testimonials_updated_at
BEFORE UPDATE ON public.home_testimonials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX home_testimonials_approved_pos_idx
ON public.home_testimonials (is_approved, position DESC, created_at DESC);

-- Storage policies for the home-testimonials bucket (bucket created via tool)
CREATE POLICY "anyone can view testimonial photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'home-testimonials');

CREATE POLICY "authenticated can upload own testimonial photo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'home-testimonials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "staff can manage testimonial photos"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'home-testimonials' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'home-testimonials' AND public.is_staff(auth.uid()));
