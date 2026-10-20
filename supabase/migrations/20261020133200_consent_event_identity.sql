-- Restore the idempotent event identity used by src/lib/consents.ts.
-- Original migration0028 is the source of this additive DDL. Campaign RPC
-- definitions are outside this correction. No granted value or consent time
-- is updated; existing events receive only an independent opaque identifier.
BEGIN;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS consent_event_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS user_consents_event_unique ON public.user_consents (user_id,consent_type,consent_event_id);
COMMIT;
