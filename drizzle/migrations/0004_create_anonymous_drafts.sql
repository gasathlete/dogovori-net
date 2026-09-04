CREATE TABLE public.anonymous_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  flow text NOT NULL,
  doc_key text,
  route text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_idx integer NOT NULL DEFAULT 0,
  has_result boolean NOT NULL DEFAULT false,
  claimed_by uuid,
  claimed_at timestamptz,
  saved_doc_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Достъпът минава само през edge функциите draft-sync / draft-claim
-- (service role). Собственикът след claim може да чете/трие своя ред.
GRANT SELECT, DELETE ON public.anonymous_drafts TO authenticated;
GRANT ALL ON public.anonymous_drafts TO service_role;

ALTER TABLE public.anonymous_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their claimed drafts"
  ON public.anonymous_drafts FOR SELECT TO authenticated
  USING (claimed_by = auth.uid());

CREATE POLICY "Owners delete their claimed drafts"
  ON public.anonymous_drafts FOR DELETE TO authenticated
  USING (claimed_by = auth.uid());

CREATE INDEX anonymous_drafts_expires_at_idx ON public.anonymous_drafts (expires_at);
CREATE INDEX anonymous_drafts_claimed_by_idx ON public.anonymous_drafts (claimed_by);

-- Срокът се валидира с trigger (CHECK трябва да е immutable).
CREATE OR REPLACE FUNCTION public.anonymous_drafts_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.flow NOT IN ('wizard', 'build') THEN
    RAISE EXCEPTION 'invalid flow';
  END IF;
  IF NEW.route !~ '^/[^/\\]' THEN
    RAISE EXCEPTION 'invalid route';
  END IF;
  IF NEW.expires_at IS NULL OR NEW.expires_at <= now() - interval '1 minute' THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  IF NEW.claimed_by IS NOT NULL AND NEW.expires_at < now() + interval '1 day' THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER anonymous_drafts_touch_trg
  BEFORE INSERT OR UPDATE ON public.anonymous_drafts
  FOR EACH ROW EXECUTE FUNCTION public.anonymous_drafts_touch();

-- Изчистване на изтеклите чернови (вика се от cron / cleanup функция).
CREATE OR REPLACE FUNCTION public.cleanup_anonymous_drafts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM public.anonymous_drafts WHERE expires_at < now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_anonymous_drafts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_anonymous_drafts() TO service_role;