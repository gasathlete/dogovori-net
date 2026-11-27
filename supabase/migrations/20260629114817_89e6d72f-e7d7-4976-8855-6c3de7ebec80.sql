
CREATE TABLE public.document_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_document_id uuid REFERENCES public.saved_documents(id) ON DELETE CASCADE,
  uploaded_contract_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  kind text NOT NULL DEFAULT 'expiration' CHECK (kind IN ('expiration','renewal','custom')),
  note text,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (saved_document_id IS NOT NULL OR uploaded_contract_id IS NOT NULL)
);

CREATE INDEX idx_document_reminders_user_remind ON public.document_reminders(user_id, remind_at);
CREATE INDEX idx_document_reminders_saved ON public.document_reminders(saved_document_id);
CREATE INDEX idx_document_reminders_uploaded ON public.document_reminders(uploaded_contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_reminders TO authenticated;
GRANT ALL ON public.document_reminders TO service_role;

ALTER TABLE public.document_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_reminders_select_own ON public.document_reminders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY document_reminders_insert_own ON public.document_reminders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY document_reminders_update_own ON public.document_reminders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY document_reminders_delete_own ON public.document_reminders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY document_reminders_service_role ON public.document_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
