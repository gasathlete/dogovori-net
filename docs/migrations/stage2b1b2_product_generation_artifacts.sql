-- Stage 2B1B2 — durable source-bound generation artifacts and exact-call replay.
-- Source only. Mandatory order: base -> 0018 -> 0019 -> 0020 -> 0021 -> 0022.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.product_fulfillment_jobs) THEN
    RAISE EXCEPTION 'product_generation_artifacts_preapply_zero_row_gate_failed';
  END IF;
END $$;

ALTER TABLE public.product_fulfillment_jobs
  ADD COLUMN IF NOT EXISTS generation_timestamp timestamptz;

CREATE TABLE public.product_generation_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.product_fulfillment_jobs(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  call_id text NOT NULL,
  cursor_key text NOT NULL,
  stage text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  request_digest text NOT NULL,
  artifact_digest text,
  redacted_artifact jsonb,
  redacted_artifact_canonical text,
  usage_input_tokens bigint,
  usage_output_tokens bigint,
  usage_cost_micro_usd bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (job_id, call_id),
  CHECK (length(btrim(call_id)) BETWEEN 1 AND 240),
  CHECK (stage IN ('passport','review','review_repair','corrections','corrections_repair','negotiation','messages','synthesis')),
  CHECK (model IN ('google/gemini-3.1-flash-lite','google/gemini-3.8-flash')),
  CHECK (status IN ('reserved','complete')),
  CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CHECK (artifact_digest IS NULL OR artifact_digest ~ '^[0-9a-f]{64}$'),
  CHECK (artifact_digest IS NULL OR artifact_digest = encode(extensions.digest(convert_to(redacted_artifact_canonical,'UTF8'),'sha256'),'hex')),
  CHECK (redacted_artifact_canonical IS NULL OR redacted_artifact_canonical::jsonb = redacted_artifact),
  CHECK ((status='reserved' AND redacted_artifact IS NULL AND artifact_digest IS NULL AND completed_at IS NULL)
    OR (status='complete' AND jsonb_typeof(redacted_artifact)='object' AND artifact_digest IS NOT NULL
      AND completed_at IS NOT NULL AND usage_input_tokens>=0 AND usage_output_tokens>=0 AND usage_cost_micro_usd>=0))
);
GRANT ALL ON public.product_generation_calls TO service_role;
ALTER TABLE public.product_generation_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_generation_calls FORCE ROW LEVEL SECURITY;

CREATE TABLE public.product_generation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.product_fulfillment_jobs(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  result_schema_version integer NOT NULL,
  source_document_id uuid NOT NULL REFERENCES public.uploaded_contracts(id) ON DELETE RESTRICT,
  source_hash text NOT NULL,
  source_kind text NOT NULL,
  source_char_count integer NOT NULL,
  source_char_unit text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  source_page_count integer,
  generation_policy_version text NOT NULL,
  cursor_key text NOT NULL,
  stage text NOT NULL,
  sequence integer NOT NULL,
  call_ids text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL,
  payload_canonical text NOT NULL,
  payload_digest text NOT NULL,
  coverage jsonb,
  generation_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id,cursor_key), UNIQUE (job_id,sequence),
  CHECK (product_id IN ('contract_check','contract_improve','negotiation_package')),
  CHECK (result_schema_version=2), CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CHECK (source_kind IN ('pdf','docx')), CHECK (source_char_count BETWEEN 80 AND 60000),
  CHECK (source_char_unit='unicode_code_points'), CHECK (length(btrim(generation_policy_version))>0),
  CHECK (stage IN ('awaiting_generation','passport','review','corrections','negotiation','messages','synthesis')),
  CHECK (jsonb_typeof(payload)='object'), CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  CHECK (coverage IS NULL OR jsonb_typeof(coverage)='object'), CHECK (sequence>=0),
  CHECK (payload_canonical::jsonb = payload),
  CHECK (payload_digest = encode(extensions.digest(convert_to(payload_canonical,'UTF8'),'sha256'),'hex'))
);
GRANT ALL ON public.product_generation_artifacts TO service_role;
ALTER TABLE public.product_generation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_generation_artifacts FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.product_generation_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'product_generation_state_is_immutable'; END $$;
CREATE TRIGGER product_generation_calls_no_delete BEFORE DELETE ON public.product_generation_calls
  FOR EACH ROW EXECUTE FUNCTION public.product_generation_immutable();
CREATE TRIGGER product_generation_artifacts_no_change BEFORE UPDATE OR DELETE ON public.product_generation_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.product_generation_immutable();

CREATE OR REPLACE FUNCTION public.reserve_product_generation_call(
  p_job_id uuid,p_lease_token uuid,p_call_id text,p_cursor_key text,p_stage text,p_model text,p_request_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; c public.product_generation_calls;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  IF public.product_job_cursor_key(j.cursor)<>p_cursor_key OR j.stage IN ('completed','failed') THEN RETURN jsonb_build_object('ok',false,'reason','cursor_changed'); END IF;
  IF p_model NOT IN ('google/gemini-3.1-flash-lite','google/gemini-3.8-flash') OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'reason','call_invalid'); END IF;
  SELECT * INTO c FROM public.product_generation_calls WHERE job_id=p_job_id AND call_id=p_call_id FOR UPDATE;
  IF c.id IS NOT NULL THEN
    IF c.cursor_key<>p_cursor_key OR c.stage<>p_stage OR c.model<>p_model OR c.request_digest<>p_request_digest THEN RETURN jsonb_build_object('ok',false,'reason','call_conflict'); END IF;
    RETURN jsonb_build_object('ok',true,'status',c.status,'artifact',c.redacted_artifact,'artifact_digest',c.artifact_digest);
  END IF;
  INSERT INTO public.product_generation_calls(job_id,entitlement_id,user_id,call_id,cursor_key,stage,model,request_digest)
    VALUES(j.id,j.entitlement_id,j.user_id,p_call_id,p_cursor_key,p_stage,p_model,p_request_digest);
  UPDATE public.product_fulfillment_jobs SET generation_timestamp=COALESCE(generation_timestamp,now()),updated_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('ok',true,'status','reserved','generation_timestamp',COALESCE(j.generation_timestamp,now()));
END $$;

CREATE OR REPLACE FUNCTION public.complete_product_generation_call(
  p_job_id uuid,p_lease_token uuid,p_call_id text,p_request_digest text,p_redacted_artifact jsonb,p_redacted_artifact_canonical text,
  p_artifact_digest text,p_usage_input_tokens bigint,p_usage_output_tokens bigint,p_usage_cost_micro_usd bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; c public.product_generation_calls;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  SELECT * INTO c FROM public.product_generation_calls WHERE job_id=p_job_id AND call_id=p_call_id FOR UPDATE;
  IF c.id IS NULL OR c.request_digest<>p_request_digest THEN RETURN jsonb_build_object('ok',false,'reason','call_conflict'); END IF;
  IF c.status='complete' THEN
    IF c.artifact_digest<>p_artifact_digest OR c.redacted_artifact<>p_redacted_artifact OR c.usage_input_tokens<>p_usage_input_tokens OR c.usage_output_tokens<>p_usage_output_tokens OR c.usage_cost_micro_usd<>p_usage_cost_micro_usd THEN RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
    RETURN jsonb_build_object('ok',true,'already_recorded',true,'artifact',c.redacted_artifact);
  END IF;
  IF jsonb_typeof(p_redacted_artifact)<>'object' OR p_artifact_digest !~ '^[0-9a-f]{64}$' OR p_redacted_artifact_canonical::jsonb<>p_redacted_artifact OR p_artifact_digest<>encode(extensions.digest(convert_to(p_redacted_artifact_canonical,'UTF8'),'sha256'),'hex') OR p_usage_input_tokens<0 OR p_usage_output_tokens<0 OR p_usage_cost_micro_usd<0 THEN RETURN jsonb_build_object('ok',false,'reason','artifact_invalid'); END IF;
  IF j.usage_calls+1>j.budget_max_calls OR j.usage_input_tokens+p_usage_input_tokens>j.budget_max_input_tokens OR j.usage_output_tokens+p_usage_output_tokens>j.budget_max_output_tokens OR j.usage_input_tokens+p_usage_input_tokens+j.usage_output_tokens+p_usage_output_tokens>j.budget_max_tokens OR j.usage_cost_micro_usd+p_usage_cost_micro_usd>j.budget_hard_cost_micro_usd THEN RETURN jsonb_build_object('ok',false,'reason','budget_exceeded'); END IF;
  UPDATE public.product_generation_calls SET status='complete',redacted_artifact=p_redacted_artifact,redacted_artifact_canonical=p_redacted_artifact_canonical,artifact_digest=p_artifact_digest,usage_input_tokens=p_usage_input_tokens,usage_output_tokens=p_usage_output_tokens,usage_cost_micro_usd=p_usage_cost_micro_usd,completed_at=now() WHERE id=c.id AND status='reserved';
  RETURN jsonb_build_object('ok',true,'already_recorded',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_product_generation_artifact(
  p_job_id uuid,p_lease_token uuid,p_next_cursor jsonb,p_call_ids text[],p_payload jsonb,p_payload_canonical text,p_payload_digest text,p_coverage jsonb DEFAULT NULL,p_release_lease boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; k text; seq integer; n integer; uin bigint; uout bigint; cost bigint; cp jsonb;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  IF jsonb_typeof(p_payload)<>'object' OR p_payload_digest !~ '^[0-9a-f]{64}$' OR p_payload_canonical::jsonb<>p_payload OR p_payload_digest<>encode(extensions.digest(convert_to(p_payload_canonical,'UTF8'),'sha256'),'hex') THEN RETURN jsonb_build_object('ok',false,'reason','artifact_invalid'); END IF;
  k:=public.product_job_cursor_key(p_next_cursor);
  IF EXISTS(SELECT 1 FROM public.product_generation_artifacts WHERE job_id=p_job_id AND cursor_key=k) THEN RETURN jsonb_build_object('ok',true,'already_recorded',true,'cursor_key',k); END IF;
  SELECT count(*),COALESCE(sum(usage_input_tokens),0),COALESCE(sum(usage_output_tokens),0),COALESCE(sum(usage_cost_micro_usd),0) INTO n,uin,uout,cost FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.call_id=ANY(COALESCE(p_call_ids,'{}')) AND c.cursor_key=public.product_job_cursor_key(j.cursor) AND c.status='complete' AND NOT EXISTS(SELECT 1 FROM public.product_generation_artifacts a WHERE a.job_id=p_job_id AND c.call_id=ANY(a.call_ids));
  IF n<>cardinality(COALESCE(p_call_ids,'{}')) THEN RETURN jsonb_build_object('ok',false,'reason','call_incomplete'); END IF;
  cp:=public.record_product_job_checkpoint(p_job_id,p_lease_token,p_next_cursor,n,uin,uout,cost,p_payload_digest,false);
  IF COALESCE((cp->>'ok')::boolean,false) IS NOT TRUE THEN RETURN cp; END IF;
  SELECT COALESCE(max(sequence),-1)+1 INTO seq FROM public.product_generation_artifacts WHERE job_id=p_job_id;
  INSERT INTO public.product_generation_artifacts(job_id,entitlement_id,user_id,product_id,result_schema_version,source_document_id,source_hash,source_kind,source_char_count,source_char_unit,source_updated_at,source_page_count,generation_policy_version,cursor_key,stage,sequence,call_ids,payload,payload_canonical,payload_digest,coverage,generation_timestamp)
  VALUES(j.id,j.entitlement_id,j.user_id,j.product_id,j.result_schema_version,j.source_document_id,j.source_hash,j.source_kind,j.source_char_count,j.source_char_unit,j.source_updated_at,j.source_page_count,j.generation_policy_version,k,p_next_cursor->>'stage',seq,COALESCE(p_call_ids,'{}'),p_payload,p_payload_canonical,p_payload_digest,p_coverage,j.generation_timestamp);
  IF p_release_lease THEN PERFORM public.release_product_job_lease(p_job_id,p_lease_token); END IF;
  RETURN jsonb_build_object('ok',true,'already_recorded',false,'cursor_key',k);
END $$;

CREATE OR REPLACE FUNCTION public.load_product_generation_state(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND lease_expires_at>now();
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  RETURN jsonb_build_object('ok',true,'generation_timestamp',j.generation_timestamp,'cursor',j.cursor,
    'usage',jsonb_build_object('calls',j.usage_calls,'input_tokens',j.usage_input_tokens,'output_tokens',j.usage_output_tokens,'cost_micro_usd',j.usage_cost_micro_usd),
    'artifacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',1,'cursorKey',a.cursor_key,'stage',a.stage,'payload',a.payload,'digest',a.payload_digest) ORDER BY a.sequence) FROM public.product_generation_artifacts a WHERE a.job_id=p_job_id),'[]'),
    'completedCallIds',COALESCE((SELECT jsonb_agg(c.call_id ORDER BY c.created_at) FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.status='complete'),'[]'));
END $$;

CREATE OR REPLACE FUNCTION public.finish_product_generation(p_job_id uuid,p_lease_token uuid,p_result jsonb,p_result_canonical text,p_result_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; e public.product_entitlements; changed integer;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  SELECT * INTO e FROM public.product_entitlements WHERE id=j.entitlement_id FOR UPDATE;
  IF e.status='ready' THEN IF e.result=p_result AND j.stage='completed' THEN RETURN jsonb_build_object('ok',true,'already_recorded',true); END IF; RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
  IF j.stage<>'synthesis' OR p_result_digest !~ '^[0-9a-f]{64}$' OR p_result_canonical::jsonb<>p_result OR p_result_digest<>encode(extensions.digest(convert_to(p_result_canonical,'UTF8'),'sha256'),'hex') OR jsonb_typeof(p_result)<>'object' OR p_result->'schema_version'<>'2' OR p_result->>'product_id'<>j.product_id OR lower(p_result->'source'->>'source_hash')<>lower(j.source_hash) OR p_result->'source'->>'document_id'<>j.source_document_id::text OR p_result->'source'->>'source_kind'<>j.source_kind OR p_result->'source'->'char_count'<>to_jsonb(j.source_char_count) OR p_result->'source'->>'char_unit'<>j.source_char_unit OR (p_result->'source'->>'source_updated_at')::timestamptz<>j.source_updated_at OR p_result->>'generated_at'<>j.generation_timestamp::text THEN RETURN jsonb_build_object('ok',false,'reason','result_invalid'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_generation_artifacts WHERE job_id=p_job_id AND stage='synthesis' AND payload_digest=p_result_digest) THEN RETURN jsonb_build_object('ok',false,'reason','artifact_missing'); END IF;
  UPDATE public.product_entitlements SET status='ready',result=p_result,result_schema_version=2,fulfilled_at=COALESCE(fulfilled_at,now()),processing_token=NULL,last_error_code=NULL,updated_at=now() WHERE id=j.entitlement_id AND status='processing' AND generation_policy_version=j.generation_policy_version AND source_hash=j.source_hash AND source_updated_at=j.source_updated_at;
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RETURN jsonb_build_object('ok',false,'reason','entitlement_changed'); END IF;
  UPDATE public.product_fulfillment_jobs SET stage='completed',cursor=jsonb_build_object('stage','completed','batch_index',0,'chunk_index',0),completed_at=COALESCE(completed_at,now()),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job_id;
  RETURN jsonb_build_object('ok',true,'already_recorded',false);
END $$;

DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.product_generation_immutable()',
    'public.reserve_product_generation_call(uuid,uuid,text,text,text,text,text)',
    'public.complete_product_generation_call(uuid,uuid,text,text,jsonb,text,text,bigint,bigint,bigint)',
    'public.record_product_generation_artifact(uuid,uuid,jsonb,text[],jsonb,text,text,jsonb,boolean)',
    'public.load_product_generation_state(uuid,uuid)',
    'public.finish_product_generation(uuid,uuid,jsonb,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',fn); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
COMMIT;
