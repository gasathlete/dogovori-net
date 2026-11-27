-- Stage 2B1B2 acceptance correction — exact current-step identity and atomic final commit.
-- Source only. Mandatory order: base -> 0018 -> 0019 -> 0020 -> 0021 -> 0022 -> 0023.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.product_fulfillment_jobs) THEN
    RAISE EXCEPTION 'product_generation_artifacts_correction_preapply_zero_row_gate_failed';
  END IF;
END $$;

REVOKE ALL ON public.product_generation_calls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_generation_artifacts FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.complete_product_generation_call(uuid,uuid,text,text,jsonb,text,text,bigint,bigint,bigint);
DROP FUNCTION IF EXISTS public.record_product_generation_artifact(uuid,uuid,jsonb,text[],jsonb,text,text,jsonb,boolean);
DROP FUNCTION IF EXISTS public.finish_product_generation(uuid,uuid,jsonb,text,text);

ALTER TABLE public.product_generation_calls
  ADD COLUMN IF NOT EXISTS reservation_token uuid,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

DO $$ DECLARE constraint_name text; BEGIN
  SELECT c.conname INTO constraint_name FROM pg_constraint c WHERE c.conrelid='public.product_generation_calls'::regclass AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%status = %reserved%redacted_artifact%';
  IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE public.product_generation_calls DROP CONSTRAINT %I',constraint_name); END IF;
END $$;
ALTER TABLE public.product_generation_calls ADD CONSTRAINT product_generation_calls_payload_ck CHECK (
  (status='reserved' AND redacted_artifact IS NULL AND redacted_artifact_canonical IS NULL AND artifact_digest IS NULL
    AND completed_at IS NULL AND reservation_token IS NOT NULL AND reservation_expires_at IS NOT NULL)
  OR
  (status='complete' AND redacted_artifact IS NOT NULL AND jsonb_typeof(redacted_artifact) IN ('object','array')
    AND redacted_artifact_canonical IS NOT NULL AND artifact_digest IS NOT NULL AND completed_at IS NOT NULL
    AND usage_input_tokens>=0 AND usage_output_tokens>=0 AND usage_cost_micro_usd>=0)
);

CREATE OR REPLACE FUNCTION public.reserve_product_generation_call(
  p_job_id uuid,p_lease_token uuid,p_call_id text,p_cursor_key text,p_stage text,p_model text,p_request_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; c public.product_generation_calls; token uuid;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  IF public.product_job_cursor_key(j.cursor)<>p_cursor_key OR j.stage IN ('completed','failed') THEN RETURN jsonb_build_object('ok',false,'reason','cursor_changed'); END IF;
  IF NOT ((j.cursor->>'stage'='awaiting_generation' AND p_stage='passport') OR p_stage=j.cursor->>'stage' OR (p_stage=j.cursor->>'stage'||'_repair')) OR p_model NOT IN ('google/gemini-3.1-flash-lite','google/gemini-3.8-flash') OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'reason','call_invalid'); END IF;
  SELECT * INTO c FROM public.product_generation_calls WHERE job_id=p_job_id AND call_id=p_call_id FOR UPDATE;
  IF c.id IS NOT NULL THEN
    IF c.cursor_key<>p_cursor_key OR c.stage<>p_stage OR c.model<>p_model OR c.request_digest<>p_request_digest THEN RETURN jsonb_build_object('ok',false,'reason','call_conflict'); END IF;
    IF c.status='complete' THEN
      IF c.artifact_digest<>encode(extensions.digest(convert_to(c.redacted_artifact_canonical,'UTF8'),'sha256'),'hex') OR c.redacted_artifact_canonical::jsonb<>c.redacted_artifact THEN RETURN jsonb_build_object('ok',false,'reason','stored_call_invalid'); END IF;
      RETURN jsonb_build_object('ok',true,'status','complete','response',jsonb_build_object('output',c.redacted_artifact,'inputTokens',c.usage_input_tokens,'outputTokens',c.usage_output_tokens,'elapsedMs',0));
    END IF;
    -- A reservation may already have crossed the provider boundary. Never make a second priced call.
    RETURN jsonb_build_object('ok',true,'status','pending','reason','call_completion_unknown');
  END IF;
  token:=gen_random_uuid();
  INSERT INTO public.product_generation_calls(job_id,entitlement_id,user_id,call_id,cursor_key,stage,model,request_digest,reservation_token,reservation_expires_at)
    VALUES(j.id,j.entitlement_id,j.user_id,p_call_id,p_cursor_key,p_stage,p_model,p_request_digest,token,LEAST(j.lease_expires_at,now()+interval '10 minutes'));
  UPDATE public.product_fulfillment_jobs SET generation_timestamp=COALESCE(generation_timestamp,now()),updated_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('ok',true,'status','acquired','reservation_token',token,'generation_timestamp',COALESCE(j.generation_timestamp,now()));
END $$;

CREATE OR REPLACE FUNCTION public.complete_product_generation_call(
  p_job_id uuid,p_lease_token uuid,p_call_id text,p_request_digest text,p_reservation_token uuid,p_redacted_artifact jsonb,p_redacted_artifact_canonical text,
  p_artifact_digest text,p_usage_input_tokens bigint,p_usage_output_tokens bigint,p_usage_cost_micro_usd bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; c public.product_generation_calls; pending_calls bigint; pending_in bigint; pending_out bigint; pending_cost bigint;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  SELECT * INTO c FROM public.product_generation_calls WHERE job_id=p_job_id AND call_id=p_call_id FOR UPDATE;
  IF c.id IS NULL OR c.request_digest<>p_request_digest OR c.reservation_token IS DISTINCT FROM p_reservation_token THEN RETURN jsonb_build_object('ok',false,'reason','call_conflict'); END IF;
  IF c.status='complete' THEN
    IF c.artifact_digest<>p_artifact_digest OR c.redacted_artifact<>p_redacted_artifact OR c.redacted_artifact_canonical<>p_redacted_artifact_canonical OR c.usage_input_tokens<>p_usage_input_tokens OR c.usage_output_tokens<>p_usage_output_tokens OR c.usage_cost_micro_usd<>p_usage_cost_micro_usd THEN RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
    RETURN jsonb_build_object('ok',true,'already_recorded',true,'response',jsonb_build_object('output',c.redacted_artifact,'inputTokens',c.usage_input_tokens,'outputTokens',c.usage_output_tokens,'elapsedMs',0));
  END IF;
  IF jsonb_typeof(p_redacted_artifact) NOT IN ('object','array') OR p_artifact_digest !~ '^[0-9a-f]{64}$' OR p_redacted_artifact_canonical::jsonb<>p_redacted_artifact OR p_artifact_digest<>encode(extensions.digest(convert_to(p_redacted_artifact_canonical,'UTF8'),'sha256'),'hex') OR p_usage_input_tokens<0 OR p_usage_output_tokens<0 OR p_usage_cost_micro_usd<0 THEN RETURN jsonb_build_object('ok',false,'reason','artifact_invalid'); END IF;
  SELECT count(*),COALESCE(sum(usage_input_tokens),0),COALESCE(sum(usage_output_tokens),0),COALESCE(sum(usage_cost_micro_usd),0) INTO pending_calls,pending_in,pending_out,pending_cost FROM public.product_generation_calls WHERE job_id=j.id AND cursor_key=public.product_job_cursor_key(j.cursor) AND status='complete';
  IF j.usage_calls+pending_calls+1>j.budget_max_calls OR j.usage_input_tokens+pending_in+p_usage_input_tokens>j.budget_max_input_tokens OR j.usage_output_tokens+pending_out+p_usage_output_tokens>j.budget_max_output_tokens OR j.usage_input_tokens+pending_in+p_usage_input_tokens+j.usage_output_tokens+pending_out+p_usage_output_tokens>j.budget_max_tokens OR j.usage_cost_micro_usd+pending_cost+p_usage_cost_micro_usd>j.budget_hard_cost_micro_usd THEN RETURN jsonb_build_object('ok',false,'reason','budget_exceeded'); END IF;
  UPDATE public.product_generation_calls SET status='complete',redacted_artifact=p_redacted_artifact,redacted_artifact_canonical=p_redacted_artifact_canonical,artifact_digest=p_artifact_digest,usage_input_tokens=p_usage_input_tokens,usage_output_tokens=p_usage_output_tokens,usage_cost_micro_usd=p_usage_cost_micro_usd,completed_at=now() WHERE id=c.id AND status='reserved';
  RETURN jsonb_build_object('ok',true,'already_recorded',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_product_generation_artifact(
  p_job_id uuid,p_lease_token uuid,p_current_cursor_key text,p_artifact_stage text,p_next_cursor jsonb,p_call_ids text[],p_payload jsonb,p_payload_canonical text,p_payload_digest text,p_generation_timestamp timestamptz,p_coverage jsonb DEFAULT NULL,p_release_lease boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; existing public.product_generation_artifacts; seq integer; n integer; uin bigint; uout bigint; cost bigint; cp jsonb;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  IF public.product_job_cursor_key(j.cursor)<>p_current_cursor_key OR NOT ((j.cursor->>'stage'='awaiting_generation' AND p_artifact_stage='passport') OR p_artifact_stage=j.cursor->>'stage') OR p_generation_timestamp IS DISTINCT FROM j.generation_timestamp THEN RETURN jsonb_build_object('ok',false,'reason','current_identity_mismatch'); END IF;
  IF jsonb_typeof(p_payload) NOT IN ('object','array') OR p_payload_digest !~ '^[0-9a-f]{64}$' OR p_payload_canonical::jsonb<>p_payload OR p_payload_digest<>encode(extensions.digest(convert_to(p_payload_canonical,'UTF8'),'sha256'),'hex') THEN RETURN jsonb_build_object('ok',false,'reason','artifact_invalid'); END IF;
  IF NOT public.product_job_cursor_advances(j.product_id,j.cursor,p_next_cursor) THEN RETURN jsonb_build_object('ok',false,'reason','cursor_invalid'); END IF;
  SELECT * INTO existing FROM public.product_generation_artifacts WHERE job_id=p_job_id AND cursor_key=p_current_cursor_key FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    IF existing.stage IS DISTINCT FROM p_artifact_stage OR existing.payload_digest IS DISTINCT FROM p_payload_digest OR existing.payload IS DISTINCT FROM p_payload OR existing.payload_canonical IS DISTINCT FROM p_payload_canonical OR existing.call_ids IS DISTINCT FROM COALESCE(p_call_ids,'{}') OR existing.entitlement_id IS DISTINCT FROM j.entitlement_id OR existing.source_hash IS DISTINCT FROM j.source_hash OR existing.source_updated_at IS DISTINCT FROM j.source_updated_at OR existing.generation_policy_version IS DISTINCT FROM j.generation_policy_version OR existing.generation_timestamp IS DISTINCT FROM p_generation_timestamp OR existing.coverage IS DISTINCT FROM jsonb_build_object('next_cursor',p_next_cursor,'coverage',p_coverage) THEN RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
    IF p_release_lease THEN PERFORM public.release_product_job_lease(p_job_id,p_lease_token); END IF;
    RETURN jsonb_build_object('ok',true,'already_recorded',true,'cursor_key',p_current_cursor_key);
  END IF;
  IF cardinality(COALESCE(p_call_ids,'{}')) <> cardinality(ARRAY(SELECT DISTINCT unnest(COALESCE(p_call_ids,'{}')))) THEN RETURN jsonb_build_object('ok',false,'reason','call_ids_duplicated'); END IF;
  SELECT count(*),COALESCE(sum(usage_input_tokens),0),COALESCE(sum(usage_output_tokens),0),COALESCE(sum(usage_cost_micro_usd),0) INTO n,uin,uout,cost FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.call_id=ANY(COALESCE(p_call_ids,'{}')) AND c.cursor_key=p_current_cursor_key AND c.stage IN (p_artifact_stage,p_artifact_stage||'_repair') AND c.status='complete' AND c.artifact_digest=encode(extensions.digest(convert_to(c.redacted_artifact_canonical,'UTF8'),'sha256'),'hex');
  IF n<>cardinality(COALESCE(p_call_ids,'{}')) THEN RETURN jsonb_build_object('ok',false,'reason','call_incomplete'); END IF;
  cp:=public.record_product_job_checkpoint(p_job_id,p_lease_token,p_next_cursor,n,uin,uout,cost,p_payload_digest,false);
  IF COALESCE((cp->>'ok')::boolean,false) IS NOT TRUE THEN RETURN cp; END IF;
  SELECT COALESCE(max(sequence),-1)+1 INTO seq FROM public.product_generation_artifacts WHERE job_id=p_job_id;
  INSERT INTO public.product_generation_artifacts(job_id,entitlement_id,user_id,product_id,result_schema_version,source_document_id,source_hash,source_kind,source_char_count,source_char_unit,source_updated_at,source_page_count,generation_policy_version,cursor_key,stage,sequence,call_ids,payload,payload_canonical,payload_digest,coverage,generation_timestamp)
  VALUES(j.id,j.entitlement_id,j.user_id,j.product_id,j.result_schema_version,j.source_document_id,j.source_hash,j.source_kind,j.source_char_count,j.source_char_unit,j.source_updated_at,j.source_page_count,j.generation_policy_version,p_current_cursor_key,p_artifact_stage,seq,COALESCE(p_call_ids,'{}'),p_payload,p_payload_canonical,p_payload_digest,jsonb_build_object('next_cursor',p_next_cursor,'coverage',p_coverage),p_generation_timestamp);
  IF p_release_lease THEN PERFORM public.release_product_job_lease(p_job_id,p_lease_token); END IF;
  RETURN jsonb_build_object('ok',true,'already_recorded',false,'cursor_key',p_current_cursor_key);
END $$;

CREATE OR REPLACE FUNCTION public.commit_product_generation_result(
  p_job_id uuid,p_lease_token uuid,p_current_cursor_key text,p_artifact_stage text,p_call_ids text[],p_result jsonb,p_result_canonical text,p_result_digest text,p_generation_timestamp timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; e public.product_entitlements; existing public.product_generation_artifacts; n integer; uin bigint; uout bigint; cost bigint; seq integer; changed integer;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  SELECT * INTO e FROM public.product_entitlements WHERE id=j.entitlement_id FOR UPDATE;
  IF e.status='ready' AND j.stage='completed' THEN
    IF e.result IS DISTINCT FROM p_result OR (e.result->>'generated_at')::timestamptz IS DISTINCT FROM p_generation_timestamp THEN RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
    RETURN jsonb_build_object('ok',true,'already_recorded',true,'result',e.result);
  END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() OR public.product_job_cursor_key(j.cursor)<>p_current_cursor_key OR j.stage<>'synthesis' OR p_artifact_stage<>'synthesis' OR p_generation_timestamp IS DISTINCT FROM j.generation_timestamp THEN RETURN jsonb_build_object('ok',false,'reason','current_identity_mismatch'); END IF;
  IF jsonb_typeof(p_result)<>'object' OR p_result_digest !~ '^[0-9a-f]{64}$' OR p_result_canonical::jsonb<>p_result OR p_result_digest<>encode(extensions.digest(convert_to(p_result_canonical,'UTF8'),'sha256'),'hex') OR (p_result->>'generated_at')::timestamptz IS DISTINCT FROM j.generation_timestamp OR p_result->'schema_version'<>'2' OR p_result->>'product_id'<>j.product_id OR lower(p_result->'source'->>'source_hash')<>lower(j.source_hash) OR p_result->'source'->>'document_id'<>j.source_document_id::text OR (p_result->'source'->>'source_updated_at')::timestamptz IS DISTINCT FROM j.source_updated_at THEN RETURN jsonb_build_object('ok',false,'reason','result_invalid'); END IF;
  SELECT * INTO existing FROM public.product_generation_artifacts WHERE job_id=p_job_id AND cursor_key=p_current_cursor_key FOR UPDATE;
  IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reason','half_state'); END IF;
  IF cardinality(COALESCE(p_call_ids,'{}')) <> cardinality(ARRAY(SELECT DISTINCT unnest(COALESCE(p_call_ids,'{}')))) THEN RETURN jsonb_build_object('ok',false,'reason','call_ids_duplicated'); END IF;
  SELECT count(*),COALESCE(sum(usage_input_tokens),0),COALESCE(sum(usage_output_tokens),0),COALESCE(sum(usage_cost_micro_usd),0) INTO n,uin,uout,cost FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.call_id=ANY(COALESCE(p_call_ids,'{}')) AND c.cursor_key=p_current_cursor_key AND c.stage='synthesis' AND c.status='complete' AND c.artifact_digest=encode(extensions.digest(convert_to(c.redacted_artifact_canonical,'UTF8'),'sha256'),'hex');
  IF n<>cardinality(COALESCE(p_call_ids,'{}')) THEN RETURN jsonb_build_object('ok',false,'reason','call_incomplete'); END IF;
  IF j.usage_calls+n>j.budget_max_calls OR j.usage_input_tokens+uin>j.budget_max_input_tokens OR j.usage_output_tokens+uout>j.budget_max_output_tokens OR j.usage_input_tokens+uin+j.usage_output_tokens+uout>j.budget_max_tokens OR j.usage_cost_micro_usd+cost>j.budget_hard_cost_micro_usd THEN RETURN jsonb_build_object('ok',false,'reason','budget_exceeded'); END IF;
  SELECT COALESCE(max(sequence),-1)+1 INTO seq FROM public.product_generation_artifacts WHERE job_id=p_job_id;
  INSERT INTO public.product_generation_artifacts(job_id,entitlement_id,user_id,product_id,result_schema_version,source_document_id,source_hash,source_kind,source_char_count,source_char_unit,source_updated_at,source_page_count,generation_policy_version,cursor_key,stage,sequence,call_ids,payload,payload_canonical,payload_digest,coverage,generation_timestamp)
  VALUES(j.id,j.entitlement_id,j.user_id,j.product_id,j.result_schema_version,j.source_document_id,j.source_hash,j.source_kind,j.source_char_count,j.source_char_unit,j.source_updated_at,j.source_page_count,j.generation_policy_version,p_current_cursor_key,'synthesis',seq,COALESCE(p_call_ids,'{}'),p_result,p_result_canonical,p_result_digest,jsonb_build_object('next_cursor',jsonb_build_object('stage','completed','batch_index',0,'chunk_index',0)),p_generation_timestamp);
  UPDATE public.product_entitlements SET status='ready',result=p_result,result_schema_version=2,fulfilled_at=COALESCE(fulfilled_at,now()),processing_token=NULL,last_error_code=NULL,updated_at=now() WHERE id=j.entitlement_id AND status='processing' AND generation_policy_version=j.generation_policy_version AND source_hash=j.source_hash AND source_updated_at=j.source_updated_at;
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'product_generation_entitlement_changed'; END IF;
  UPDATE public.product_fulfillment_jobs SET usage_calls=usage_calls+n,usage_input_tokens=usage_input_tokens+uin,usage_output_tokens=usage_output_tokens+uout,usage_cost_micro_usd=usage_cost_micro_usd+cost,stage='completed',cursor=jsonb_build_object('stage','completed','batch_index',0,'chunk_index',0),completed_at=COALESCE(completed_at,now()),lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_job_id;
  RETURN jsonb_build_object('ok',true,'already_recorded',false,'result',p_result);
END $$;

CREATE OR REPLACE FUNCTION public.load_product_generation_state(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND lease_expires_at>now();
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  RETURN jsonb_build_object('ok',true,'generation_timestamp',j.generation_timestamp,'cursor',j.cursor,
    'usage',jsonb_build_object('calls',j.usage_calls,'input_tokens',j.usage_input_tokens,'output_tokens',j.usage_output_tokens,'cost_micro_usd',j.usage_cost_micro_usd),
    'artifacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',1,'cursorKey',a.cursor_key,'stage',a.stage,'payload',a.payload,'canonical',a.payload_canonical,'digest',a.payload_digest,'nextCursor',a.coverage->'next_cursor') ORDER BY a.sequence) FROM public.product_generation_artifacts a WHERE a.job_id=p_job_id),'[]'),
    'completedCallIds',COALESCE((SELECT jsonb_agg(c.call_id ORDER BY c.created_at) FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.status='complete'),'[]'));
END $$;

DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.reserve_product_generation_call(uuid,uuid,text,text,text,text,text)',
    'public.complete_product_generation_call(uuid,uuid,text,text,uuid,jsonb,text,text,bigint,bigint,bigint)',
    'public.record_product_generation_artifact(uuid,uuid,text,text,jsonb,text[],jsonb,text,text,timestamptz,jsonb,boolean)',
    'public.commit_product_generation_result(uuid,uuid,text,text,text[],jsonb,text,text,timestamptz)',
    'public.load_product_generation_state(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',fn); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
COMMIT;
