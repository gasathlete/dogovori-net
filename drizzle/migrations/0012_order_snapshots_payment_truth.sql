-- Истина за плащането в `order_snapshots` (Stage 2d0).
--
-- Цел: собственическото табло да може да брои САМО доказани живи плащания.
-- Forward-only и напълно additive: три нови колони с NOT NULL DEFAULT 'unknown',
-- затворени CHECK ограничения и индекс за периодните заявки.

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