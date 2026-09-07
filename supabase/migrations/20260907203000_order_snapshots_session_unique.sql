-- Идемпотентно доказателство за поръчка: една Stripe сесия → най-много един ред.
--
-- Контекст: `payments-webhook` вече записва `order_snapshots` при
-- `checkout.session.completed`. Stripe повтаря доставките, затова записът
-- става fail-closed UPSERT по `stripe_session_id` — това изисква уникален
-- индекс върху колоната.
--
-- ПРЕДУСЛОВИЕ (проверено само за четене преди писането на миграцията):
-- в момента `public.order_snapshots` е празна (0 реда), затова уникалният
-- индекс не може да се провали и НЕ се налага изтриване или сливане на данни.
-- Ако в бъдеща среда таблицата съдържа дублиращи се непразни
-- `stripe_session_id`, миграцията ще се провали нарочно — данните се изчистват
-- съзнателно, а не автоматично тук.
--
-- PostgreSQL допуска множество NULL стойности в уникален индекс, така че
-- исторически/ръчни редове без Stripe сесия остават валидни.

CREATE UNIQUE INDEX IF NOT EXISTS order_snapshots_stripe_session_id_key
  ON public.order_snapshots (stripe_session_id);

COMMENT ON INDEX public.order_snapshots_stripe_session_id_key IS
  'Идемпотентност на webhook-а: една Stripe checkout сесия → най-много един snapshot. NULL е разрешен многократно.';
