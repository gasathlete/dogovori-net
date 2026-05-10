-- ============================================================
-- 1) Cleanup orphans (must run BEFORE adding FK constraints)
-- ============================================================
DELETE FROM public.risk_analyses ra
 WHERE NOT EXISTS (SELECT 1 FROM public.uploaded_contracts uc WHERE uc.id = ra.uploaded_contract_id);

DELETE FROM public.shared_links sl
 WHERE NOT EXISTS (SELECT 1 FROM public.saved_documents sd WHERE sd.id = sl.document_id);

UPDATE public.uploaded_contracts
   SET contact_id = NULL
 WHERE contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id);

UPDATE public.uploaded_contracts
   SET folder_id = NULL
 WHERE folder_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id);

UPDATE public.saved_documents
   SET contact_id = NULL
 WHERE contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id);

UPDATE public.saved_documents
   SET folder_id = NULL
 WHERE folder_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id);

-- ============================================================
-- 2) Foreign keys
-- ============================================================
ALTER TABLE public.risk_analyses
  ADD CONSTRAINT risk_analyses_uploaded_contract_fk
  FOREIGN KEY (uploaded_contract_id)
  REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.shared_links
  ADD CONSTRAINT shared_links_document_fk
  FOREIGN KEY (document_id)
  REFERENCES public.saved_documents(id) ON DELETE CASCADE;

ALTER TABLE public.uploaded_contracts
  ADD CONSTRAINT uploaded_contracts_contact_fk
  FOREIGN KEY (contact_id)
  REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.uploaded_contracts
  ADD CONSTRAINT uploaded_contracts_folder_fk
  FOREIGN KEY (folder_id)
  REFERENCES public.folders(id) ON DELETE SET NULL;

ALTER TABLE public.saved_documents
  ADD CONSTRAINT saved_documents_contact_fk
  FOREIGN KEY (contact_id)
  REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.saved_documents
  ADD CONSTRAINT saved_documents_folder_fk
  FOREIGN KEY (folder_id)
  REFERENCES public.folders(id) ON DELETE SET NULL;

-- ============================================================
-- 3) Unique constraints / partial indexes
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS shared_links_token_uniq
  ON public.shared_links(token);

CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_one_active_per_email
  ON public.team_invitations(team_id, lower(email))
  WHERE accepted_at IS NULL;

-- ============================================================
-- 4) Length cap on uploaded contract text (defensive)
-- ============================================================
ALTER TABLE public.uploaded_contracts
  ADD CONSTRAINT uploaded_contracts_text_length_chk
  CHECK (length(extracted_text) <= 300000);