# Roadmap

- [x] Main static commerce installation 19.10: deploy static-catalog/payments-webhook, smoke 401/400/live OFF, verified owner_operator onboarding without asset acceptance; report in docs/operations/static-commerce-main-install-2026-10-19.md. Frontend release and actual accepted live file/price remain parent/owner actions.

- [x] Catalog regen 19.10: inventory 625/576, register, checks, 5 candidate v2 rewrites, tests.
- [x] Catalog regen addendum: FAQ candidates for 4 docs, owner-read sources registry, content scan (445), title-only generators retired, evidence-aware generator for all 545 files.
- [ ] Catalog regen: run evidence-aware generation in batches (needs owner go-ahead for AI cost) and review 24 content files with findings.
- [ ] Catalog regen: legal review of 5 candidates — waits on lawyer.
- [ ] Catalog regen: 540 scanned-only files, 49 without text, 73 orphan, 54 duplicate drafts — owner decision/next waves.
- [ ] bun.lock is v1 on HEAD — regenerate with Bun 1.4.2.

- [x] Beta 19.10: sync package.json/bun.lock with Bun 1.4.2, retain v3/scoped overrides, fix SDK advisory, add regression tests and readiness report.
- [ ] Beta 19.10: braces high advisory — blocked by no published fixed upstream version; compatible dependency replacement/migration requires separate work.
- [ ] Beta 19.10: independent app typecheck, full production build pipeline and GitHub rerun — no such results exposed by the local automatic build harness.

- [x] Gate 8: reconcile public free-start copy with paid one-off product prices.
- [x] Make disabled prelaunch checkout/upload/result actions honest and fail-closed.
- [x] Remove unsupported public compliance assurances, including „GDPR съвместим“ on `/plans`.
- [x] Add focused offer/CTA tests and run typecheck, tests, and production build.
- [x] Prelaunch: общ диалог за предварителна заявка, свързан с бланки и генериране (source only).
- [x] Prelaunch: подготвена миграция (неприложена), честно състояние при липсващ сървър, отделно съгласие, път за оттегляне.
- [ ] Prelaunch: останалите CTA (асистент, регистрация, планове) и сървърни проверки по матрица — следваща стъпка.
- [ ] Blocker: правен текст, контролер и срок на съхранение — изисква юрист.
- [x] Prelaunch: активните абонати запазват бланки и генериране; матрица с правата на субекта (never_gated).
- [ ] Решение: сценарий А (абонамент за бланки без AI) или Б (contract_check с DPA) — чака собственика.
- [x] Продуктова витрина: „Пакети“ и надградени „Комплекти“ непосредствено след социалното доказателство.
- [x] Публични маршрути `/paketi` и `/paketi/:slug` с реални каталожни връзки и честни планирани позиции.
- [x] Единно заключено състояние за покупки и предварителна заявка без checkout или запис на сурово съдържание.
- [x] Проектна документация, GitHub шаблони, SEO маршрути, тестове и визуална проверка.
- [x] Review: заключване в реалните продуктови карти на началната страница.
- [x] Review: шест реални сценарийни цикъла в детайлите на комплектите.
- [x] Review: уникални package stage IDs, депозитна разписка и проверени налични/планирани бройки.
- [x] Review: практично превключване на проекта и точен sync/publish статус в документацията.
- [x] Review: фокусирани тестове, app typecheck, build/CI gate и мобилен преглед.
- [x] Финален performance проход: variable шрифтове, надежден Lighthouse audit и shell asset проверки.
- [x] Скрий „Тестов период“ в header под 640 px, обнови stored shell и провери 390 px с отворено „Затвори“.
- [x] Security audit 28.09: dependency patches, PDF.js hardening, SigningPane columns, DB hardening patch + PGlite tests, report.
- [ ] Owner: review/apply docs/migrations/security_hardening_2026_09_28.sql, then publish (blocked on owner review).
