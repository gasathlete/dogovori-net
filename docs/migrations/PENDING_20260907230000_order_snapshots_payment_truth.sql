-- STATUS: ПОДГОТВЕН, НЕПРИЛОЖЕН. НЕ Е в supabase/migrations по инструкция
-- (Stage 2d0 е source-only: без изпълнение на миграции). Папката
-- supabase/migrations е под управлението на платформения механизъм и не приема
-- ръчно добавени файлове, затова точният SQL е стажиран тук за преглед.
-- Прилага се само след изричен одобрен „staged production step“.
--
-- ВНИМАНИЕ: `payments-webhook` вече записва `environment`, `payment_status` и
-- `purchase_kind` в `order_snapshots`. Функцията НЕ трябва да се разгръща,
-- преди тази миграция да е приложена.
--
-- Истина за плащането в `order_snapshots` (Stage 2d0).
--
-- Цел: собственическото табло да може да брои САМО доказани живи плащания.
-- Досега редът съдържаше сума и Stripe сесия, но не и окръжението, доказания
-- статус на плащането и вида покупка. Без тях „доказан платец“ не е механично
-- защитим: sandbox тест, забавено (unpaid) плащане и нулева сума изглеждат
-- еднакво с реално платена live поръчка.
--
-- Forward-only и напълно additive:
--   * три нови колони с NOT NULL DEFAULT 'unknown' → съществуващите редове
--     остават ИЗРИЧНО `unknown` и НЕ могат да бъдат броени като доказани
--     плащания;
--   * без UPDATE, без backfill, без DELETE, без промяна на тип и без
--     преименуване;
--   * затворени CHECK ограничения, за да не може приложението да запише
--     произволен етикет;
--   * индекс за периодните заявки на таблото.
--
-- ПРОВЕРЕН ФАКТ ОТ ПРЕДИШЕН ОДИТ: `public.order_snapshots` е с 0 реда, затова
-- добавянето на NOT NULL DEFAULT и на CHECK ограниченията не може да се
-- провали върху заварени данни.

ALTER TABLE public.order_snapshots
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS purchase_kind text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.order_snapshots'::regclass
       AND conname = 'order_snapshots_environment_check'
  ) THEN
    ALTER TABLE public.order_snapshots
      ADD CONSTRAINT order_snapshots_environment_check
      CHECK (environment IN ('live', 'sandbox', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.order_snapshots'::regclass
       AND conname = 'order_snapshots_payment_status_check'
  ) THEN
    ALTER TABLE public.order_snapshots
      ADD CONSTRAINT order_snapshots_payment_status_check
      CHECK (payment_status IN ('paid', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.order_snapshots'::regclass
       AND conname = 'order_snapshots_purchase_kind_check'
  ) THEN
    ALTER TABLE public.order_snapshots
      ADD CONSTRAINT order_snapshots_purchase_kind_check
      CHECK (purchase_kind IN (
        'team', 'subscription', 'strict_unlock', 'branding',
        'entry_pack', 'topup', 'one_time', 'unknown'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_order_snapshots_payment_truth
  ON public.order_snapshots (environment, payment_status, created_at DESC);

COMMENT ON COLUMN public.order_snapshots.environment IS
  'Окръжение на плащането: live | sandbox | unknown (заварени редове). Само live се брои за доказан платец.';
COMMENT ON COLUMN public.order_snapshots.payment_status IS
  'Доказан статус от Stripe: paid се записва само при session.payment_status = paid; unknown = недоказано.';
COMMENT ON COLUMN public.order_snapshots.purchase_kind IS
  'Затворен вид покупка, изведен от режима на сесията и познати lookup keys — никога от произволна metadata.';
