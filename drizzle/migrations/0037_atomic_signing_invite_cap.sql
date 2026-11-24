-- Atomic per-owner daily signing-invitation cap (50 signers / rolling 24h).
-- Check + insert happen under a transaction-scoped advisory lock per owner,
-- so concurrent requests cannot jointly exceed the cap. Service role only.
CREATE OR REPLACE FUNCTION public.create_signing_envelope_capped(
  p_owner uuid,
  p_request jsonb,
  p_signers jsonb,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent integer;
  v_new integer := jsonb_array_length(p_signers);
  v_req public.signing_requests;
  v_signers jsonb;
BEGIN
  IF p_owner IS NULL OR v_new < 1 THEN
    RAISE EXCEPTION 'invalid_envelope';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signing_invite_cap:' || p_owner::text, 0));

  SELECT count(*) INTO v_recent
  FROM public.signing_request_signers s
  JOIN public.signing_requests r ON r.id = s.request_id
  WHERE r.owner_id = p_owner AND r.created_at >= now() - interval '24 hours';

  IF v_recent + v_new > p_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_invite_limit', 'recent', v_recent);
  END IF;

  INSERT INTO public.signing_requests
    (owner_id, team_id, saved_document_id, uploaded_contract_id, title,
     document_snapshot, metadata, order_mode, expires_at, status)
  VALUES (
    p_owner,
    NULLIF(p_request->>'team_id', '')::uuid,
    NULLIF(p_request->>'saved_document_id', '')::uuid,
    NULLIF(p_request->>'uploaded_contract_id', '')::uuid,
    p_request->>'title',
    p_request->'document_snapshot',
    COALESCE(p_request->'metadata', '{}'::jsonb),
    (p_request->>'order_mode')::public.signing_order_mode,
    (p_request->>'expires_at')::timestamptz,
    'pending'
  ) RETURNING * INTO v_req;

  WITH ins AS (
    INSERT INTO public.signing_request_signers (request_id, name, email, role, order_idx, sign_token)
    SELECT v_req.id, x->>'name', x->>'email', NULLIF(x->>'role', ''), (x->>'order_idx')::int, x->>'sign_token'
    FROM jsonb_array_elements(p_signers) x
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ins) ORDER BY ins.order_idx), '[]'::jsonb) INTO v_signers FROM ins;

  RETURN jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'signers', v_signers);
END;
$$;

REVOKE ALL ON FUNCTION public.create_signing_envelope_capped(uuid, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_signing_envelope_capped(uuid, jsonb, jsonb, integer) TO service_role;
