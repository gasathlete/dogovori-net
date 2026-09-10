-- ПРЕГЛЕД, НЕ ПРИЛОЖЕНА. Само добавъчно: метаданни за пълнотата на прочетения
-- източник при еднократните продукти. Нищо не се преименува, изтрива или
-- стеснява.
--
-- Клиентът може да пише в `uploaded_contracts` (свои редове), затова тези
-- полета НЕ са доказателство. Сървърът винаги преизчислява SHA-256 и дължината
-- и приема само `full`.

ALTER TABLE public.uploaded_contracts
  ADD COLUMN IF NOT EXISTS product_extraction_status text,
  ADD COLUMN IF NOT EXISTS product_extracted_chars integer,
  ADD COLUMN IF NOT EXISTS product_source_pages integer,
  ADD COLUMN IF NOT EXISTS product_source_kind text,
  ADD COLUMN IF NOT EXISTS product_extraction_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_extraction_status_ck
    CHECK (product_extraction_status IS NULL
           OR product_extraction_status IN ('full', 'partial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_source_kind_ck
    CHECK (product_source_kind IS NULL
           OR product_source_kind IN ('pdf', 'docx', 'paste'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_extracted_chars_ck
    CHECK (product_extracted_chars IS NULL
           OR (product_extracted_chars >= 0 AND product_extracted_chars <= 60000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Заявката за плащане носи измерената истина за източника.
ALTER TABLE public.product_checkout_intakes
  ADD COLUMN IF NOT EXISTS source_char_count integer,
  ADD COLUMN IF NOT EXISTS source_page_count integer,
  ADD COLUMN IF NOT EXISTS source_extraction_status text;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_status_ck
    CHECK (source_extraction_status IS NULL OR source_extraction_status = 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_chars_ck
    CHECK (source_char_count IS NULL
           OR (source_char_count > 0 AND source_char_count <= 60000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Резултат не може да е „пълен“ за частичен източник.
ALTER TABLE public.product_entitlements
  ADD COLUMN IF NOT EXISTS source_char_count integer,
  ADD COLUMN IF NOT EXISTS source_extraction_status text;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_source_status_ck
    CHECK (source_extraction_status IS NULL OR source_extraction_status = 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
