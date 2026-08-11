ALTER TABLE public.home_testimonials
  ADD COLUMN IF NOT EXISTS is_verified_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_ref text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

DROP POLICY IF EXISTS "users insert own testimonials" ON public.home_testimonials;
CREATE POLICY "users insert own testimonials"
ON public.home_testimonials
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_approved = false
  AND is_admin_added = false
  AND is_verified_customer = false
);