
-- Defense-in-depth: explicit RESTRICTIVE policies denying any non-service-role
-- read access to PII-bearing internal email tables. These tables are intended
-- to be reachable only via the service_role from edge functions.

-- email_send_log
CREATE POLICY "Deny non-service read on email_send_log"
  ON public.email_send_log
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "Deny non-service write on email_send_log"
  ON public.email_send_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- email_unsubscribe_tokens
CREATE POLICY "Deny non-service read on email_unsubscribe_tokens"
  ON public.email_unsubscribe_tokens
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "Deny non-service write on email_unsubscribe_tokens"
  ON public.email_unsubscribe_tokens
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- suppressed_emails
CREATE POLICY "Deny non-service read on suppressed_emails"
  ON public.suppressed_emails
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "Deny non-service write on suppressed_emails"
  ON public.suppressed_emails
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
