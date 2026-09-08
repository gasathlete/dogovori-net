-- Q2a — трайно доказателствено състояние на риск-анализа (ЗА ПРЕГЛЕД, НЕ Е ПРИЛОЖЕНА).
--
-- Цел: резултатът от `analyze-contract` да носи проверимо, устойчиво на
-- презареждане и кеш състояние на доказателствената проверка, вместо ефимерен
-- флаг в отговора или префикс в текста на резюмето.
--
-- Съдържание на колоната (пишe се само от edge функцията, service_role):
--   {
--     "version": 1,
--     "status": "evidence_checked" | "incomplete",
--     "reason_codes": ["quote_unverified", "input_truncated", ...],
--     "counts": { "issues_raw": 3, "issues_kept": 2, "issues_rejected": 1,
--                 "missing_raw": 1, "missing_kept": 1, "missing_rejected": 0 },
--     "source_text_hash": "<вече съществуващият версиониран хеш на текста>",
--     "score_trusted": true | false
--   }
--
-- Поверителност: в метаданните НЯМА суров текст на документа, цитати, заглавия
-- на находки или идентификатори на потребител/поръчка — само кодове и числа.
--
-- ХАРАКТЕР НА ПРОМЯНАТА:
--   * само едно ново NULLABLE поле, без DEFAULT, без NOT NULL;
--   * БЕЗ UPDATE, БЕЗ backfill, БЕЗ DELETE върху съществуващи редове;
--   * няма промяна на други колони, типове, политики или индекси.
--
-- ЛЕГАСИ ПОВЕДЕНИЕ: липсваща стойност (NULL) означава `legacy_unverified` —
-- такъв запис се показва неутрално и НЕ се сертифицира със задна дата.
-- Несъвместими/повредени метаданни се третират като `unverified`.
--
-- ЗАВИСИМОСТИ ОТ СХЕМАТА: изисква съществуващата таблица `public.risk_analyses`
-- (колони `score`, `summary`, `issues`, `missing_clauses`, `text_hash`).
-- RLS политиките на таблицата остават непроменени — новото поле се чете от
-- същия собственик на реда, който вече чете `score` и `summary`.

ALTER TABLE public.risk_analyses
  ADD COLUMN IF NOT EXISTS verification JSONB;

COMMENT ON COLUMN public.risk_analyses.verification IS
  'Q2a: състояние на доказателствената проверка (version/status/reason_codes/counts/score_trusted). NULL = legacy_unverified. Без суров текст и без идентификатори.';
