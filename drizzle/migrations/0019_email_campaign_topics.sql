-- Campaign topics (themes) for email/internal notification campaigns
CREATE TABLE IF NOT EXISTS public.email_campaign_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  link text,
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_sent_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_topics TO authenticated;
GRANT ALL ON public.email_campaign_topics TO service_role;

ALTER TABLE public.email_campaign_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage campaign topics" ON public.email_campaign_topics;
CREATE POLICY "Staff manage campaign topics"
ON public.email_campaign_topics
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Recipients: users without an explicit marketing refusal ("+")
CREATE OR REPLACE FUNCTION public.admin_list_marketing_recipients(_search text DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE (user_id uuid, email text, display_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u.email::text, p.display_name, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE public.is_staff(auth.uid())
    AND u.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_consents c
      WHERE c.user_id = u.id AND c.consent_type = 'marketing' AND c.granted = false
    )
    AND (
      _search IS NULL OR _search = ''
      OR u.email ILIKE '%' || _search || '%'
      OR COALESCE(p.display_name, '') ILIKE '%' || _search || '%'
    )
  ORDER BY u.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000)
$$;

REVOKE ALL ON FUNCTION public.admin_list_marketing_recipients(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_marketing_recipients(text, integer) TO authenticated;

-- Send internal notifications for a topic to every "+" user
CREATE OR REPLACE FUNCTION public.admin_send_campaign_topic(_topic_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_topic public.email_campaign_topics;
  v_count integer := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_topic FROM public.email_campaign_topics WHERE id = _topic_id;
  IF v_topic.id IS NULL THEN
    RAISE EXCEPTION 'topic not found';
  END IF;
  IF v_topic.is_active = false THEN
    RAISE EXCEPTION 'topic is not active';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link, created_by)
  SELECT u.id, 'campaign', v_topic.title, v_topic.body, v_topic.link, auth.uid()
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_consents c
      WHERE c.user_id = u.id AND c.consent_type = 'marketing' AND c.granted = false
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.email_campaign_topics
  SET last_sent_at = now(), last_sent_count = v_count
  WHERE id = _topic_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_send_campaign_topic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_send_campaign_topic(uuid) TO authenticated;