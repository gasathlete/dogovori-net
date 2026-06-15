GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;
DROP POLICY IF EXISTS "Admins manage plans" ON public.plans;
CREATE POLICY "Public can view active plans"
ON public.plans
FOR SELECT
TO anon, authenticated
USING (active = true);
CREATE POLICY "Admins can view all plans"
ON public.plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage plans"
ON public.plans
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view active features" ON public.plan_features;
DROP POLICY IF EXISTS "Admins manage features" ON public.plan_features;
CREATE POLICY "Public can view active features"
ON public.plan_features
FOR SELECT
TO anon, authenticated
USING (active = true);
CREATE POLICY "Admins can view all features"
ON public.plan_features
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage features"
ON public.plan_features
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view comparison rows" ON public.plan_comparison_rows;
DROP POLICY IF EXISTS "Admins manage comparison rows" ON public.plan_comparison_rows;
CREATE POLICY "Public can view active comparison rows"
ON public.plan_comparison_rows
FOR SELECT
TO anon, authenticated
USING (active = true);
CREATE POLICY "Admins can view all comparison rows"
ON public.plan_comparison_rows
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage comparison rows"
ON public.plan_comparison_rows
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));