# План: Затопляне на кеша на бланките (Опция В — идемпотентно)

## Цел
Един бутон в `/admin`, който генерира всички липсващи бланки от каталога (461 моноезични + 20 билингвални = 481 потенциални) и пропуска вече кешираните. Безгрешно, последователно, с retry. Може да се пуска многократно без риск.

## Поток

1. **Бутон** „🔥 Warm blanks cache" в `Admin.tsx` отваря модал с прогрес.
2. **Frontend** изгражда списък от `src/data/catalog.ts`: за всяка категория → за всеки документ → `{ sector_id, document_name, sector_title, bilingual: doc.bilingual === true }`. Само 20-те маркирани документа се пускат и в билингвален вариант.
3. **Pre-check (опционално, бързо)**: чете `document_blanks` веднъж и маркира кои вече имат валиден `storage_path` (`v4/` или `v4-bilingual/`). Това позволява UI да покаже „N от 481 вече кеширани" преди старт.
4. **Последователна обработка** (една по една, никаква паралелност), пауза 500 ms между извикванията.
5. За всяка задача се вика нов edge function **`warm-blank-cache`**.
6. **Progress UI**: текущ индекс/общо, име на бланка, статус (skipped / generated / failed), брояч на успешни/пропуснати/грешни, бутон „Pause" и „Stop".
7. След края: обобщение + downloadable JSON лог с грешките за повторен опит.

## Edge function: `warm-blank-cache` (нова)

Огледало на генериращата част от `download-blank`, но:
- **Staff guard**: изисква `is_staff(auth.uid())`, иначе 403.
- **НЕ извиква `consume_quota`** — нулев разход за staff.
- Приема: `{ sector_id, document_name, sector_title, bilingual }`.
- Проверка в `document_blanks`: ако съществува запис със `storage_path` започващ с правилния `CACHE_VERSION` (`v4/` за моно, `v4-bilingual/` за bil) → връща `{ status: "skipped" }` веднага, без AI заявка.
- Иначе генерира с **`google/gemini-2.5-pro`** (същия модел като production за качество), пакетира .docx с `docx@8.5.0`, ъплоудва в bucket `document-blanks`, ъпсърт в `document_blanks`.
- **Retry с backoff** при AI грешки: до 3 опита (2s, 6s, 15s) при 429/5xx/timeout.
- При финален провал → връща `{ status: "failed", error }` (200 OK с тяло, не 500), за да продължи batch-ът.
- Reuse на `SYSTEM_PROMPT`, `BILINGUAL_ADDENDUM`, `buildDocx`, `document-types` spec — идентично качество с production.

## Frontend контрол (sequential, безгрешно)

- Едно `await` на заявка, никаква паралелност.
- При мрежова грешка → auto-retry на същата задача до 2 пъти преди `failed`.
- При HTTP 429 → пауза 10 сек и продължава.
- При затваряне/Stop процесът спира на следващата итерация (не убива текущата заявка).
- **Идемпотентно**: повторно натискане пропуска всички вече кеширани — безопасно за многократно пускане.

## Безопасност

- Staff guard и на сървъра (`is_staff`), и на бутона (`/admin` вече има guard).
- Никакви промени в DB schema, RLS, квоти или потребителския UI.
- Cache key се пази (`v4` / `v4-bilingual`) — никакво презаписване на валидни файлове.

## Файлове

| Файл | Промяна |
|------|---------|
| `supabase/functions/warm-blank-cache/index.ts` | **Нов** — staff-only генератор без quota |
| `src/lib/blankCatalog.ts` | **Нов** helper — flatten на `catalog.ts` в 481 задачи |
| `src/components/admin/BlankCacheWarmer.tsx` | **Нов** модал с batch loop, прогрес, error log |
| `src/pages/Admin.tsx` | Нов бутон, който отваря модала |

Никакви миграции.

## Оценка

- **Първи run** (всичко некеширано): ~481 × ~8 сек ≈ **65 минути** под надзор.
- **Следващи runs**: основно skipped (БД lookup без AI), ~481 × ~0.3 сек ≈ **2.5 минути**.
- Admin трябва да държи модала отворен по време на работа (показваме предупреждение „Don't close this tab").
