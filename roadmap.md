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
