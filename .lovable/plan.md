## Проблем

При натискане на „Индексирай" в `/admin/legal-kb` POST към `fetch-legal-source` връща `Failed to fetch` (виж network log). Едж функцията съществува в кода (`supabase/functions/fetch-legal-source/index.ts` и `ingest-legal-source/index.ts`), но **не е деплойната** — `supabase--edge_function_logs` за нея връща `No logs found` (никога не е била извикана успешно на сървъра).

Двете функции липсват и в `supabase/config.toml`, така че никой автоматичен деплой не ги е поел.

## План за поправка

1. **Деплой на двете функции** към Lovable Cloud:
   - `fetch-legal-source`
   - `ingest-legal-source`
   
   И двете изискват вход (admin/staff проверка чрез `is_staff`), затова остават с дефолтното `verify_jwt = true`. Няма нужда от запис в `config.toml` — дефолтът е правилен. (Записваме само ако се случи проблем при деплоя.)

2. **Smoke тест** след деплой:
   - От браузъра с логнат admin акаунт да натиснем „Извлечи" с URL `https://lex.bg/laws/ldoc/521957377` и да проверим, че функцията връща `200` с `raw_text`, а после „Индексирай" преминава.
   - Ако се появи 401/403 — значи потребителят няма роля `admin` в `user_roles`; ще го покажа в съобщението.
   - Ако се появи 500 с CORS / fetch грешка от lex.bg → ще проверим логовете през `supabase--edge_function_logs`.

3. **Не променям бизнес логиката** — кодът на функциите вече е написан коректно (allow-list домейни, валидация, дедупликация по checksum, RAG ingestion с embeddings). Просто трябва да тръгне на сървъра.

## Технически детайли

- Деплоят се прави с `supabase--deploy_edge_functions` за `fetch-legal-source` и `ingest-legal-source`.
- Функциите четат `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` (вече налични в Lovable Cloud) + `LOVABLE_API_KEY` (за embeddings при ingest).
- Не пипам клиентския код в `AdminLegalKB.tsx` — URL-ите и хедърите там са коректни.

## Файлове, които ще се променят

Никакви файлове в repo-то — само деплой на двете edge функции.