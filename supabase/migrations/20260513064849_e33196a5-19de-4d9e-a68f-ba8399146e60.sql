
-- New table for AI-extracted contract blanks (collected from /build flow).
CREATE TABLE public.custom_contract_blanks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source_user_id UUID NULL,
  category TEXT NOT NULL,
  category_sector_id TEXT NULL,
  name TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  blank_payload JSONB NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  published_sector_id TEXT NULL,
  published_document_name TEXT NULL,
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT custom_contract_blanks_status_chk CHECK (status IN ('pending','published','rejected'))
);

CREATE UNIQUE INDEX custom_contract_blanks_text_hash_idx ON public.custom_contract_blanks(text_hash);
CREATE INDEX custom_contract_blanks_status_idx ON public.custom_contract_blanks(status, created_at DESC);

ALTER TABLE public.custom_contract_blanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blanks_staff_select"
  ON public.custom_contract_blanks
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "blanks_staff_update"
  ON public.custom_contract_blanks
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "blanks_staff_delete"
  ON public.custom_contract_blanks
  FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "blanks_service_role_all"
  ON public.custom_contract_blanks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER custom_contract_blanks_set_updated_at
  BEFORE UPDATE ON public.custom_contract_blanks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
