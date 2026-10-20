DO $receipt_lifecycle$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_text_attestations a
    LEFT JOIN public.uploaded_contracts d ON d.id=a.uploaded_contract_id
    LEFT JOIN auth.users u ON u.id=a.user_id
    WHERE d.id IS NULL OR u.id IS NULL OR d.user_id<>a.user_id
  ) THEN RAISE EXCEPTION 'receipt ownership preflight failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_text_attestations_user_fk' AND conrelid='public.product_text_attestations'::regclass) THEN
    ALTER TABLE public.product_text_attestations ADD CONSTRAINT product_text_attestations_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_text_attestations_document_fk' AND conrelid='public.product_text_attestations'::regclass) THEN
    ALTER TABLE public.product_text_attestations ADD CONSTRAINT product_text_attestations_document_fk FOREIGN KEY (uploaded_contract_id) REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE;
  END IF;
END $receipt_lifecycle$;
