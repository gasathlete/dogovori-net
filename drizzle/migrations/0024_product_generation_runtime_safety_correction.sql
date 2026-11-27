-- Stage 2B1B2 final safety correction: immutable clock and real passport transition.
-- Source only. Mandatory order: base -> 0018 -> 0019 -> 0020 -> 0021 -> 0022 -> 0023 -> 0024.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.product_fulfillment_jobs) THEN
    RAISE EXCEPTION 'product_generation_runtime_safety_preapply_zero_row_gate_failed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_product_generation_timestamp_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.generation_timestamp IS NOT NULL AND NEW.generation_timestamp IS DISTINCT FROM OLD.generation_timestamp THEN
    RAISE EXCEPTION 'product_generation_timestamp_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_generation_timestamp_immutable ON public.product_fulfillment_jobs;
CREATE TRIGGER product_generation_timestamp_immutable BEFORE UPDATE OF generation_timestamp ON public.product_fulfillment_jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_generation_timestamp_immutable();

CREATE OR REPLACE FUNCTION public.product_job_cursor_advances(p_product_id text,p_current jsonb,p_next jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE seq text[]; current_pos integer; next_pos integer; current_batch numeric; current_chunk numeric; next_batch numeric; next_chunk numeric;
BEGIN
  IF jsonb_typeof(p_current)<>'object' OR jsonb_typeof(p_next)<>'object' OR jsonb_typeof(p_current->'batch_index')<>'number' OR jsonb_typeof(p_current->'chunk_index')<>'number' OR jsonb_typeof(p_next->'batch_index')<>'number' OR jsonb_typeof(p_next->'chunk_index')<>'number' THEN RETURN false; END IF;
  seq:=public.product_job_stage_sequence(p_product_id); current_pos:=array_position(seq,p_current->>'stage'); next_pos:=array_position(seq,p_next->>'stage');
  current_batch:=(p_current->'batch_index')::numeric; current_chunk:=(p_current->'chunk_index')::numeric; next_batch:=(p_next->'batch_index')::numeric; next_chunk:=(p_next->'chunk_index')::numeric;
  IF current_pos IS NULL OR next_pos IS NULL OR next_batch<0 OR next_chunk<0 OR next_batch<>trunc(next_batch) OR next_chunk<>trunc(next_chunk) THEN RETURN false; END IF;
  IF p_current->>'stage'='awaiting_generation' AND p_next->>'stage'='review' THEN RETURN next_batch=0 AND next_chunk=0; END IF;
  IF next_pos=current_pos+1 THEN RETURN next_batch=0 AND next_chunk=0; END IF;
  IF next_pos<>current_pos THEN RETURN false; END IF;
  RETURN next_batch>current_batch OR (next_batch=current_batch AND next_chunk>current_chunk);
END $$;

CREATE OR REPLACE FUNCTION public.load_product_generation_state(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  IF j.stage IN ('completed','failed') OR j.cursor->>'stage' IS DISTINCT FROM j.stage THEN RETURN jsonb_build_object('ok',false,'reason','state_invalid'); END IF;
  IF j.generation_timestamp IS NULL THEN UPDATE public.product_fulfillment_jobs SET generation_timestamp=now(),updated_at=now() WHERE id=j.id RETURNING * INTO j; END IF;
  RETURN jsonb_build_object('ok',true,'generation_timestamp',j.generation_timestamp,'cursor',j.cursor,
    'usage',jsonb_build_object('calls',j.usage_calls,'input_tokens',j.usage_input_tokens,'output_tokens',j.usage_output_tokens,'cost_micro_usd',j.usage_cost_micro_usd),
    'artifacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',1,'cursorKey',a.cursor_key,'stage',a.stage,'payload',a.payload,'canonical',a.payload_canonical,'digest',a.payload_digest) ORDER BY a.sequence) FROM public.product_generation_artifacts a WHERE a.job_id=p_job_id),'[]'),
    'completedCallIds',COALESCE((SELECT jsonb_agg(c.call_id ORDER BY c.created_at) FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.status='complete'),'[]'));
END $$;

CREATE OR REPLACE FUNCTION public.record_product_generation_artifact(
  p_job_id uuid,p_lease_token uuid,p_current_cursor_key text,p_artifact_stage text,p_next_cursor jsonb,p_call_ids text[],p_payload jsonb,p_payload_canonical text,p_payload_digest text,p_generation_timestamp timestamptz,p_coverage jsonb DEFAULT NULL,p_release_lease boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.product_fulfillment_jobs; existing public.product_generation_artifacts; seq integer; n integer; uin bigint; uout bigint; cost bigint; cp jsonb; passport_step boolean; stored_coverage jsonb;
BEGIN
  SELECT * INTO j FROM public.product_fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'reason','lease_invalid'); END IF;
  passport_step:=j.cursor->>'stage'='awaiting_generation' AND p_artifact_stage='passport' AND p_next_cursor->>'stage'='review'; stored_coverage:=jsonb_build_object('next_cursor',p_next_cursor,'coverage',p_coverage);
  IF public.product_job_cursor_key(j.cursor)<>p_current_cursor_key OR NOT (passport_step OR p_artifact_stage=j.cursor->>'stage') OR p_generation_timestamp IS DISTINCT FROM j.generation_timestamp THEN RETURN jsonb_build_object('ok',false,'reason','current_identity_mismatch'); END IF;
  IF jsonb_typeof(p_payload) NOT IN ('object','array') OR p_payload_digest !~ '^[0-9a-f]{64}$' OR p_payload_canonical::jsonb<>p_payload OR p_payload_digest<>encode(extensions.digest(convert_to(p_payload_canonical,'UTF8'),'sha256'),'hex') OR NOT public.product_job_cursor_advances(j.product_id,j.cursor,p_next_cursor) THEN RETURN jsonb_build_object('ok',false,'reason','artifact_invalid'); END IF;
  SELECT * INTO existing FROM public.product_generation_artifacts WHERE job_id=p_job_id AND cursor_key=p_current_cursor_key FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    IF existing.stage IS DISTINCT FROM p_artifact_stage OR existing.payload_digest IS DISTINCT FROM p_payload_digest OR existing.payload IS DISTINCT FROM p_payload OR existing.payload_canonical IS DISTINCT FROM p_payload_canonical OR existing.call_ids IS DISTINCT FROM COALESCE(p_call_ids,'{}') OR existing.entitlement_id IS DISTINCT FROM j.entitlement_id OR existing.source_hash IS DISTINCT FROM j.source_hash OR existing.source_updated_at IS DISTINCT FROM j.source_updated_at OR existing.generation_policy_version IS DISTINCT FROM j.generation_policy_version OR existing.generation_timestamp IS DISTINCT FROM p_generation_timestamp OR existing.coverage IS DISTINCT FROM stored_coverage THEN RETURN jsonb_build_object('ok',false,'reason','replay_mismatch'); END IF;
    IF p_release_lease THEN PERFORM public.release_product_job_lease(p_job_id,p_lease_token); END IF;
    RETURN jsonb_build_object('ok',true,'already_recorded',true,'cursor_key',p_current_cursor_key);
  END IF;
  IF cardinality(COALESCE(p_call_ids,'{}'))<>cardinality(ARRAY(SELECT DISTINCT unnest(COALESCE(p_call_ids,'{}')))) THEN RETURN jsonb_build_object('ok',false,'reason','call_ids_duplicated'); END IF;
  SELECT count(*),COALESCE(sum(usage_input_tokens),0),COALESCE(sum(usage_output_tokens),0),COALESCE(sum(usage_cost_micro_usd),0) INTO n,uin,uout,cost FROM public.product_generation_calls c WHERE c.job_id=p_job_id AND c.call_id=ANY(COALESCE(p_call_ids,'{}')) AND c.cursor_key=p_current_cursor_key AND c.stage IN (p_artifact_stage,p_artifact_stage||'_repair') AND c.status='complete' AND c.artifact_digest=encode(extensions.digest(convert_to(c.redacted_artifact_canonical,'UTF8'),'sha256'),'hex');
  IF n<>cardinality(COALESCE(p_call_ids,'{}')) THEN RETURN jsonb_build_object('ok',false,'reason','call_incomplete'); END IF;
  IF passport_step THEN
    cp:=public.record_product_job_checkpoint(p_job_id,p_lease_token,jsonb_build_object('stage','passport','batch_index',0,'chunk_index',0),n,uin,uout,cost,p_payload_digest,false); IF COALESCE((cp->>'ok')::boolean,false) IS NOT TRUE THEN RETURN cp; END IF;
    cp:=public.record_product_job_checkpoint(p_job_id,p_lease_token,p_next_cursor,0,0,0,0,p_payload_digest,p_release_lease);
  ELSE cp:=public.record_product_job_checkpoint(p_job_id,p_lease_token,p_next_cursor,n,uin,uout,cost,p_payload_digest,p_release_lease); END IF;
  IF COALESCE((cp->>'ok')::boolean,false) IS NOT TRUE THEN RETURN cp; END IF;
  SELECT COALESCE(max(sequence),-1)+1 INTO seq FROM public.product_generation_artifacts WHERE job_id=p_job_id;
  INSERT INTO public.product_generation_artifacts(job_id,entitlement_id,user_id,product_id,result_schema_version,source_document_id,source_hash,source_kind,source_char_count,source_char_unit,source_updated_at,source_page_count,generation_policy_version,cursor_key,stage,sequence,call_ids,payload,payload_canonical,payload_digest,coverage,generation_timestamp)
  VALUES(j.id,j.entitlement_id,j.user_id,j.product_id,j.result_schema_version,j.source_document_id,j.source_hash,j.source_kind,j.source_char_count,j.source_char_unit,j.source_updated_at,j.source_page_count,j.generation_policy_version,p_current_cursor_key,p_artifact_stage,seq,COALESCE(p_call_ids,'{}'),p_payload,p_payload_canonical,p_payload_digest,stored_coverage,p_generation_timestamp);
  RETURN jsonb_build_object('ok',true,'already_recorded',false,'cursor_key',p_current_cursor_key);
END $$;

DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.enforce_product_generation_timestamp_immutable()','public.product_job_cursor_advances(text,jsonb,jsonb)','public.load_product_generation_state(uuid,uuid)','public.record_product_generation_artifact(uuid,uuid,text,text,jsonb,text[],jsonb,text,text,timestamptz,jsonb,boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',fn); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',fn); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
  END LOOP;
END $$;
COMMIT;
