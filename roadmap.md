# Roadmap — Conversion reliability (етап 1)

Ограничения: без production deployment, без промяна на цени/планове/лимити/дизайн/маркетинг текст.

## В процес
- [ ] doc_start само при съзнателно действие (Wizard, BuildContract) + отделно view събитие
- [ ] Канонична фуния (src/lib/funnelEvents.ts) с идемпотентност на сесия + документ
- [ ] user_id attribution: кеширан auth state + DB тригер `auth.uid()`; signup_completed
- [ ] Typed generation errors + idempotent job reattach (без двойно създаване/таксуване)
- [ ] generate-job: idempotency_key, timeout/stale sweeper, статус нормализация (done ≡ completed)
- [ ] Тестове: event semantics, dedup, auth attribution, generation error paths
- [ ] Проверки: tsgo, vitest, deno tests

## Готово
- [x] Одит на call sites и данни (31 дни)

## Бележки / решения
- Съхраняваните имена на съществуващите събития остават (doc_start, doc_generate_*, …) заради
  growth_snapshot SQL, /admin/generation, /admin/funnel. Каноничното име пътува в props.event.
- Живият сайт (assets/index-B9itkTOQ.js) не изпраща user_id — поправката от 03.09 не е публикувана.
