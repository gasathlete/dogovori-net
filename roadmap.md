# Roadmap — Conversion reliability

Ограничения: без production deployment, без промяна на цени/планове/лимити/дизайн/маркетинг текст.

## Готово (етап 1)
- [x] Одит на call sites и данни (31 дни)
- [x] doc_start (document_selected) само при съзнателно действие — Wizard + BuildContract
- [x] Канонична фуния (src/lib/funnelEvents.ts) с идемпотентност (клиент + уникален индекс)
- [x] user_id attribution: DB тригер от JWT + lazy identity listener; signup_completed
- [x] Typed generation errors (src/lib/generationErrors.ts) + idempotent job reattach
- [x] generate-job: idempotency_key, stale sweeper, статус нормализация (done ≡ completed)
- [x] BuildContract: invokeEdgeFunction с мрежови повторения, типизирани грешки, result_viewed, document_saved
- [x] auth_prompt_shown централно в InlineAuthDialog (intent/docKey/source; silent за ROI диалога)
- [x] checkout_completed с dedup по Stripe session id; purchase tracking еднократно
- [x] Тестове: funnelEvents / docFunnel / generationReliability (36) + CI стъпка; пълен vitest 194/194; tsgo чист
- [x] Browser smoke: mount не праща doc_start; първо действие → doc_start с dedup_key; "Напред" → doc_fill_step

## Готово (етап 2 — завършване)
- [x] checkout_started = реално създадена Stripe сесия (StripeEmbeddedCheckout: account_subscription/topup/branding/team + strict unlock); кликът върху карта в /plans вече е само plans_cta_clicked (GA)
- [x] paywall_shown в каноничната фуния за pro_dialog (ProUpgradeDialog, по контролирания `open`) и pillar (PaidOnlyOverlay)
- [x] /start: doc_start дедуп по intent (doc_key=intent.id) — всеки интент се брои веднъж, не само първият
- [x] Server logs: V8 JSON.parse цитатът от суровия AI изход се маскира («snippet») — без частични ЕГН/телефони
- [x] Тестове: checkoutTracking (8, vitest) + generation-status (10) и ai-json-retry (10) Deno; CI стъпка с setup-deno; vitest 202/202, deno 65/65, tsgo чист
- [x] Browser (влязъл потребител): doc_start пристига с user_id (client) и се записва с user_id в базата; тестовите редове са изтрити

## Етап 3 — activation continuity (пуснато на 25%, security hardening готов в кода)
- [x] `src/lib/activationDraft.ts`: указател в localStorage без лични данни + съдържание в sessionStorage, TTL 24 ч, tab id, миграция и изтриване на старите ключове (`wizard:*`, `build:custom-contract`)
- [x] Миграция `0004_create_anonymous_drafts.sql`: `public.anonymous_drafts` (token_hash, RLS само за собственика, grants, TTL trigger, `cleanup_anonymous_drafts()`)
- [x] Edge функции `draft-sync` (rate limit, лимит 512 KB, токен само хеширан) и `draft-claim` (user от JWT, constant-time сравнение, атомарен claim, авто-запис в „Моите документи")
- [x] `useActivationDraft` + wire-up в Wizard и BuildContract; резервен запис в таба при неуспешна синхронизация
- [x] Връщане след вход: `useAuth` праща потребителя към маршрута на черновата, ако няма изрична цел (нов таб от имейл, OAuth)
- [x] Канонични събития: draft_created / autosaved / restore_offered / restored / claim_started / claim_succeeded / claim_blocked / draft_expired / draft_sync_blocked
- [x] Плочка в /admin/metrics за claim успеваемост (+ бележка за TTL 24 ч / 30 дни и прехвърляне в „Моите документи")
- [x] Hardening (само код + тестове): `_shared/draft-auth.ts` (чисти решения за sync/claim, JWT само от заглавката, токен ротиран след claim, TTL 30 дни за присвоени, прехвърлена чернова приема само route/step); `src/lib/safeRoute.ts` — едно място за защита от open redirect (Auth, InlineAuthDialog, CheckoutReturn, SubscriptionTab, Wizard); `ab.ts` — детерминистични кофи (10 000) + миграция на старите варианти; указателят маха токена след claim; закъснял sync не сваля `claimed`; записите изчакват claim в движение; празен снапшот при отваряне не създава чернова; legacy миграция без загуба (стажиране до потвърден сървърен запис)
- [x] Тестове: activationDraft (28), safeRoute (9), ab (9), docFunnel/funnelEvents; draft-auth + draft-token (19, Deno); vitest 248/248, tsgo чист; Playwright: idle open → 0 заявки, въвеждане → 1 sync, reload → възстановено, вход → claim преди sync, без токен в указателя
- [ ] Деплой на новите `draft-sync` / `draft-claim` (JWT път за присвоени чернови — до деплоя клиентът работи съвместимо със старата версия, но всеки запис след вход създава нова анонимна чернова) — чака одобрение
- [ ] След деплой: Playwright сценарии шаблон → уизард → inline signup → същата стъпка; резултат → signup → запис; изтекла чернова; два таба
- [ ] Rollout 25% → 50% → 100% при claim успеваемост ≥ 95% и без спад на индекса на качеството

## Готови за следващ етап
- [ ] Deploy на `generate-job` и `generate-contract` (idempotency_key, `completed`, error_code) — чака одобрение
- [ ] /admin/generation: разрез по `error_class` и `retryable`, колона correlation_id за бърза диагностика
- [ ] /admin/funnel: изглед по канонично име (props.event) + сегмент по auth_prompt_shown → signup_completed
- [ ] Wizard: reattach индикатор „продължаваме предишното генериране“ в UI (сега само toast)
- [ ] Почистване на pre-existing `any` в BuildContract.tsx / CheckoutReturn.tsx (lint)

## Бележки / решения
- Съхраняваните имена на събитията остават (doc_start, doc_generate_*, …) заради growth_snapshot SQL,
  /admin/generation, /admin/funnel. Каноничното име пътува в props.event.
- Живият сайт (assets/index-B9itkTOQ.js) не изпраща user_id — поправката не е публикувана.
- Суров текст на грешки никога не влиза в funnel props; причината е стабилен код + error_class.
- Платформената тестова сесия носи фалшив user.created_at (=сега) → клиентът я брои като signup_completed.
  В production user обектът идва от auth сървъра, затова 15-мин прозорецът е коректен; тестовият ред е изтрит.
- /admin/metrics „checkout completion“ вече е completed/started върху реални Stripe сесии — очаквайте
  по-нисък брой „Стартиран checkout“ спрямо преди (кликовете в /plans вече не се броят като checkout).

## Core Web Vitals field baseline (source-only, HEAD 6205024)
- [x] Миграция под supabase/migrations (pending, НЕ приложена), docs/db премахнат
- [ ] types.ts: web_vitals_daily Row/Insert/Update + record_web_vital_aggregate Args/Returns (generated-style)
- [ ] Типизирани .from/.rpc без кастове; Window гард за boot маркера
- [ ] Тестове: реален път на миграцията, NULL отказ, рейтинг/стойност прагове, точни включителни граници, типове, без docs дубликат, 7/30 UTC прозорци
- [ ] security-allowlist.json — само таргетирано изключение за SECURITY DEFINER без authz (ако скенерът го изисква)
- [ ] focused tests, пълен Vitest, tsgo, `bunx vite build` (без sitemap/IndexNow/deploy/migration apply)
