# План: Скорост и оптимизация при 50+ активни потребителя

Целта е двойна: (1) да получим **реален бенчмарк** при 50–100 паралелни сесии и (2) да поправим конкретните тесни места, които вече се виждат в prod телеметрията, преди да пуснем товара.

---

## 1. Диагноза от реалните данни (какво вече знаем)

От `pg_stat_statements` (текущ prod трафик, ниска концурентност) най-натоварените заявки са:

| # | Заявка | Викания | Общо | Max | Проблем |
|---|---|---|---|---|---|
| 1 | `INSERT public.page_views` (track-pageview) | 5 247 | 29.9 s | **1.76 s** | Синхронен write на всеки route change → блокира при пик |
| 2 | `SELECT download_quota WHERE user_id=…` (3 варианта на колони) | 6 274 | 17.3 s | 182 ms | Един и същ ред се тегли ~10 пъти на сесия — 0 кеш |
| 3 | `SELECT saved_documents ORDER BY created_at DESC` (без user_id във WHERE) | 807 + 313 | 11.2 s | **1.76 s** | RLS филтрира на ниво ред, но Postgres чете и сортира широка колона; липсва индекс `(user_id, created_at DESC)` |
| 4 | `team_members → teams` join | 7 301 | 10.3 s | 105 ms | Извиква се на всеки render на хедъра/акаунта |
| 5 | `SELECT partners WHERE status=…` | 1 572 | 2.95 s | — | Публична, статична листа — тегли се на всяко зареждане |
| 6 | `page_views SELECT ... session_id/path/event` (bounce check) | 3 546 | 3.4 s | 59 ms | Всеки pageview прави read преди write |

При 50 конкурентни сесии това мащабира линейно → писането в `page_views` и повтарящите се `download_quota` четения ще насищат pooler-а първи.

---

## 2. Load-test харнес (реална симулация)

Добавяме `scripts/loadtest/` с **k6** скриптове (headless, npm-only, без нови зависимости в апа):

- `scripts/loadtest/browse.k6.ts` — симулира анонимен посетител: `/`, `/catalog`, `/sektor/*`, `/shablon/*`, `/blog`. Мери TTFB, p95, error rate.
- `scripts/loadtest/wizard.k6.ts` — логнат потребител (test-акаунт от secrets): отваря wizard, попълва отговори, извиква `generate-contract`, сваля PDF. Мери edge-function latency и quota consume.
- `scripts/loadtest/mixed.k6.ts` — 70% browse / 20% wizard / 10% assistant chat, ramp: 0→50 VUs за 1 мин, hold 3 мин, spike 50→100 за 30 s.
- `scripts/loadtest/README.md` — как се пуска локално (`k6 run`) и от GitHub Action (`workflow_dispatch`).

Резултатите се пишат в `reports/loadtest-<timestamp>.json` + summary в конзолата (p50/p95/p99, RPS, грешки по endpoint).

**Acceptance targets** за 50 VU mixed:
- p95 route navigation < 800 ms
- p95 `generate-contract` < 8 s
- Error rate < 1%
- 0 × 5xx от edge functions

---

## 3. Точкови оптимизации (по приоритет на impact)

### 3.1. `page_views` — най-големият bottleneck
- **Batch-ване клиент-страна**: `src/lib/pageviewTracker.ts` събира събития в buffer, flush-ва на всеки 5 s или при `visibilitychange=hidden` с `navigator.sendBeacon`. Един HTTP request → до 20 pageviews.
- Edge function `track-pageview` приема масив; един `INSERT ... SELECT unnest(...)`.
- Индекс: `CREATE INDEX idx_page_views_session_path_event ON page_views (session_id, path, event, created_at DESC)` — покрива bounce-check query #6.

### 3.2. `download_quota` — кеш в React Query
- Един `useQuota()` hook с `@tanstack/react-query`, `staleTime: 60_000`, `refetchOnWindowFocus: false`. Инвалидация след `download-document` / `apply-corrections` success (те вече връщат `remaining_ops` в отговора — ще го използваме за оптимистичен update без нов SELECT).
- Замяна на директните `supabase.from("download_quota").select(...)` из компонентите с този hook.

### 3.3. `saved_documents` индекс
- Миграция: `CREATE INDEX idx_saved_documents_user_created ON saved_documents (user_id, created_at DESC)`. RLS вече филтрира по `user_id`, но липсата на индекс кара planner-а да прави seq-scan + sort.
- Същото за `risk_analyses (user_id, created_at DESC)`.

### 3.4. `team_members`/`teams` — сесионен кеш
- `useTeam()` hook да ползва React Query с `staleTime: 5 * 60_000`. Timing показва, че teams-контекстът се re-fetch-ва по няколко пъти на страница.

### 3.5. `partners` — статично зареждане
- Кешираме отговора в `localStorage` за 24 h + fetch с `stale-while-revalidate`. Публична листа, безопасно.

### 3.6. Realtime channel цена
- Аудит на всички `supabase.channel(...)` subscriptions — при 50 VU всеки открит канал държи websocket. Затваряме неизползваните (напр. в размонтирани модали) и агрегираме notifications в един канал per user.

---

## 4. Frontend performance при concurrency

- **`Suspense` boundaries на heavy pages**: `Wizard`, `BuildContract`, `Assistant` вече са lazy — проверяваме че `pdf/docx/mammoth` chunks не се prefetch-ват без нужда (`usePrefetchExporters` да не тръгва на mobile под slow-2G — `navigator.connection.effectiveType`).
- **React Query defaults** глобално: `retry: 1`, `refetchOnWindowFocus: false`, `gcTime: 5 min`. Намалява ненужните refetch-и при tab switching.
- **`<img loading="lazy" decoding="async">`** одит на sector/hero изображенията (LCP елементът остава eager).

---

## 5. Backend защита от пик

- **Rate limit на `track-pageview`**: 1 batch / 5 s / session (сървър-страна check в `_shared/rate-limit.ts`).
- **Rate limit на `generate-contract` / `analyze-contract`**: вече има; проверяваме че лимитите са адекватни за 50+ VU (напр. 10/min/user, 200/min/IP).
- **PgBouncer**: следим `db_health` след деплоя; ако pool saturation > 80% при 50 VU → предлагаме `resize_compute` (не го правим сега — първо мерим).

---

## 6. Наблюдение

- Добавяме `AdminPerf` секция „Load-test history" — чете последните JSON-и от `reports/loadtest-*`.
- Sentry performance sampling временно вдигнат на 10% по време на теста; връща се на 1% след.

---

## 7. Технически детайли (за референция)

**Файлове, които ще се пипнат:**
- нови: `scripts/loadtest/*.k6.ts`, `scripts/loadtest/README.md`, `src/hooks/useQuota.ts`
- edit: `src/lib/pageviewTracker.ts` (batch), `supabase/functions/track-pageview/index.ts` (array insert + rate-limit), `src/hooks/useTeam.tsx` (React Query), `src/pages/Index.tsx` (partners cache), `src/main.tsx` (React Query defaults), `src/pages/AdminPerf.tsx` (loadtest tab)
- миграция: 3 индекса (`page_views`, `saved_documents`, `risk_analyses`)

**Ред на изпълнение (за да мерим ефекта):**
1. Baseline: пускам k6 mixed@50 VU **преди** промените → записвам числата.
2. Прилагам 3.1 + 3.2 + 3.3 (най-голям impact) → повторен k6.
3. Прилагам останалите → финален k6.
4. Показвам таблица преди/след в чата.

**Извън обхват (сега):**
- Промяна на compute size — първо мерим, после решаваме.
- CDN на API отговорите — Supabase Edge не поддържа out-of-box.
- Пренаписване на генерацията на договор в стрийминг — отделна голяма промяна.

---

Одобряваш ли този план? Ако да, започвам с baseline k6 run и индексите, преди да пипам application код.