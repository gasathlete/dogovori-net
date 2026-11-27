
CREATE OR REPLACE FUNCTION public.submit_wizard_feedback(
  _rating int,
  _body text,
  _subject text DEFAULT NULL,
  _source_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _awarded_count int;
  _feedback_id uuid;
  _award_ops boolean := false;
  _ctx jsonb := COALESCE(_source_context, '{}'::jsonb);
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  IF _body IS NULL OR length(btrim(_body)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_short');
  END IF;

  -- Count previously rewarded wizard feedbacks for this user (lifetime cap = 3)
  SELECT count(*)::int INTO _awarded_count
  FROM public.feedback_submissions
  WHERE user_id = _uid
    AND COALESCE((source_context->>'awarded_ops')::int, 0) > 0;

  IF _awarded_count < 3 THEN
    _award_ops := true;
  END IF;

  INSERT INTO public.feedback_submissions (
    user_id, category, source_page, source_context, subject, body, rating
  ) VALUES (
    _uid,
    'other',
    'wizard',
    _ctx || jsonb_build_object('awarded_ops', CASE WHEN _award_ops THEN 2 ELSE 0 END,
                               'beta', true),
    COALESCE(NULLIF(btrim(_subject), ''), 'Обратна връзка от Wizard'),
    _body,
    GREATEST(1, LEAST(5, COALESCE(_rating, 5)))
  ) RETURNING id INTO _feedback_id;

  IF _award_ops THEN
    INSERT INTO public.download_quota (user_id, topup_ops_balance)
    VALUES (_uid, 2)
    ON CONFLICT (user_id) DO UPDATE
      SET topup_ops_balance = COALESCE(public.download_quota.topup_ops_balance, 0) + 2,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', _feedback_id,
    'awarded_ops', CASE WHEN _award_ops THEN 2 ELSE 0 END,
    'awarded_count_so_far', _awarded_count + CASE WHEN _award_ops THEN 1 ELSE 0 END
  );
END $$;

REVOKE ALL ON FUNCTION public.submit_wizard_feedback(int, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_wizard_feedback(int, text, text, jsonb) TO authenticated, service_role;
