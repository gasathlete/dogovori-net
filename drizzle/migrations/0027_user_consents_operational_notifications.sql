-- Разширява CHECK на user_consents.consent_type с 'operational_notifications'.
-- Без това flushPendingConsents() (src/lib/consents.ts) връща невалидна стойност
-- и целият insert (terms/privacy/age_18/marketing) се отхвърля атомарно —
-- съгласията и маркетинговият отказ се губят безшумно.
-- Приложено в базата на 2026-09-16.
ALTER TABLE public.user_consents DROP CONSTRAINT user_consents_consent_type_check;
ALTER TABLE public.user_consents ADD CONSTRAINT user_consents_consent_type_check
  CHECK (consent_type IN ('terms','privacy','marketing','ai_disclaimer','cookies','age_18','operational_notifications'));
