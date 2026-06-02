# Dogovori.net → надминаване на LawDepot

Целта: превърнем wizard-а в истинско **динамично дърво от решения** с conditional clause engine, надградим discovery, e-sign и dashboard, и подготвим архитектура за EN/международна версия. Фазиран roadmap, всяка фаза доставима самостоятелно.

---

## Фаза 1 — Динамично дърво от решения (ядрото)

Това е сърцето на платформата. Днес wizard-ът използва статичен набор полета на документ; целим граф от въпроси с branching, conditional визуализация и conditional клаузи.

**1.1 Question Graph schema (SSOT)**
- Нова структура `QuestionNode` в `src/lib/questionGraph.ts`:
  - `id`, `label`, `help`, `field_type`, `options`, `validators`
  - `visible_when` / `required_when` — boolean expression върху отговорите
  - `branches[]` — кои въпроси следват при кои отговори
  - `affects_clauses[]` — кои клаузи се добавят/премахват/модифицират
- Единен resolver (`evaluateGraph(answers, graph)`) → активни въпроси, прогрес, грешки.
- Per-template граф файлове в `src/data/questionGraphs/<slug>.ts`; миграция от `documentFieldSchemas.ts` (постепенна, най-използваните 30 шаблона първо).

**1.2 Conditional Clause Engine**
- Нова таблица `template_clauses` (clause_id, template_slug, title, body_md, `include_when` expression, order, severity).
- `assembleDocument(answers, clauses)` връща финален текст само с включените клаузи; placeholder substitution с типизирани токени.
- Real-time live preview (вече има `LiveDraft.tsx`) се пресмята reactively при всяка промяна на отговор.

**1.3 Wizard UX redesign (split view)**
- Split layout: ляво въпроси (с прогрес steps по секции), дясно live preview с highlight на променените клаузи.
- "Why we ask" tooltips, защо точно този въпрос (за trust).
- Save & resume автоматично; resume линкове в notifications.
- Back/forward без загуба на state, deep-linkable step (`?step=...`).

**1.4 Scope guard (вече започнато)**
- Audit script: за всеки шаблон да изброи въпросите, които WIZARD ще покаже, и да flag-не въпроси извън scope. Резултатът е CSV в `/mnt/documents/wizard-scope-audit.csv` за staff review.

---

## Фаза 2 — Discovery & каталог (LawDepot-grade)

**2.1 Search**
- Full-text търсене по име/синоними/keywords (Postgres `tsvector` + GIN индекс на `template_search_index`).
- Instant search в Header (cmd+k), с категории, най-популярни и "наскоро ползвани от теб".

**2.2 Каталог UX**
- Filters: сектор, страна по договора, цел, юрисдикция, език.
- "Best for…" use-case карти на категорийните страници.
- Related templates на всяка template page (вече има база в `relatedTemplates.ts`, ще се обогати чрез co-usage analytics).
- Breadcrumbs + JSON-LD навсякъде.

**2.3 Trust & social proof**
- "Used N times this month" брояч на template карта (от `audit_log` агрегати).
- Lawyer-reviewed badge per template (нов флаг `reviewed_by_lawyer` + дата).
- Testimonials секция на хоум.

---

## Фаза 3 — E-sign, sharing & dashboard

**3.1 Multi-party signing**
- Дефиниране на signer roles в wizard (вече има parties); sign order (sequential/parallel).
- Per-signer share links с email напомняния (cron edge function на 24h/72h).
- Audit trail page per документ (кой кога видя/подписа, IP hash, OTP option).

**3.2 Document lifecycle**
- Статуси: draft → sent → partially_signed → completed → archived/expired.
- Reminder при изтичане (срок на договора), renewal предложение.
- Версии: всяка промяна след signing → нова версия с diff.

**3.3 Dashboard 2.0**
- Cards по статус, drag&drop в папки, bulk actions, export ZIP.
- "Action needed" inbox: чакащи подписи, изтичащи договори, неприключени wizards.

---

## Фаза 4 — Съдържание & SEO authority

- Разширени guide-ове за всеки топ template (закони, casuistika, FAQ schema, internal linking).
- "Compare templates" страници (напр. граждански vs трудов договор).
- Glossary на правни термини с auto-link от blog/templates.
- Schema.org: `LegalService`, `FAQPage`, `HowTo`, `BreadcrumbList` навсякъде.
- Programmatic SEO: per-сектор + per-роля landing страници.

---

## Фаза 5 — i18n & EN версия

**5.1 Архитектура**
- `react-i18next` с namespace per route; ключове в `src/locales/<lang>/<ns>.json`.
- URL стратегия: `dogovori.net/bg/...` и `dogovori.net/en/...`, hreflang tags, отделен sitemap per locale.
- DB: `locale` колона на `notifications`, `saved_documents`, `template_clauses`; templates получават `i18n_key` родителски + per-locale тяло.

**5.2 EN съдържание (Phase 5b)**
- 20–30 най-използвани шаблона преведени и адаптирани (jurisdiction-agnostic версии + UK/EU варианти).
- EN blog seed (10 статии) за SEO.
- EUR/GBP/USD валути в pricing (вече EUR), Stripe products per region.

---

## Фаза 6 — Backend polish & enterprise-readiness

- RLS audit (linter + manual review на всички таблици, особено team_*).
- Edge function observability: structured logs, Sentry traces, error budget dashboards.
- Performance: prerender top 200 страници, image CDN, Lighthouse target ≥95.
- Rate limiting на public edge functions (assistant-chat, ocr-contract).
- GDPR self-service: export & delete account (вече има delete-account, добавяме export ZIP).
- Backup & restore процедура документирана.

---

## Технически детайли

```text
src/
  lib/
    questionGraph.ts          // resolver, types, expression evaluator
    clauseEngine.ts           // assembleDocument, diffing
    i18n.ts                   // i18next setup
  data/
    questionGraphs/<slug>.ts  // per-template graph
  locales/{bg,en}/<ns>.json
  components/wizard/
    SplitWizard.tsx           // нов split layout
    QuestionGraphRunner.tsx
    ClausePreview.tsx         // highlights diff
  pages/
    Wizard.tsx                // pre-existing, switch to SplitWizard

supabase/migrations/
  - template_clauses (clause_id, template_slug, body_md, include_when, order)
  - template_search_index (tsvector materialized view)
  - documents.status enum + version table
  - signing_audit (event log per share_link)
  - i18n columns where needed
```

Expression език за `visible_when`/`include_when`: безопасен mini-DSL (whitelist на operators `==`, `!=`, `>`, `<`, `in`, `and`, `or`, `not`) с unit tests, без `eval`.

---

## Предложена последователност (sprint-ове по ~1 седмица)

```text
Sprint 1   Фаза 1.1 + 1.2   Question graph schema + clause engine + tests
Sprint 2   Фаза 1.3 + 1.4   Split wizard UI, live preview, scope audit
Sprint 3   Фаза 2.1 + 2.2   Search + каталог UX
Sprint 4   Фаза 2.3 + 4     Trust signals + SEO authority pages
Sprint 5   Фаза 3.1 + 3.2   Multi-party sign, lifecycle
Sprint 6   Фаза 3.3 + 6     Dashboard 2.0, backend polish
Sprint 7   Фаза 5.1         i18n архитектура + URL/hreflang
Sprint 8   Фаза 5.2         EN съдържание, regional Stripe
```

---

## Какво ще започна първо при approve

Sprint 1: създавам `questionGraph.ts` + `clauseEngine.ts` с типове, resolver и unit tests; миграция за `template_clauses`; пилотирам с 1–2 шаблона (учредителен акт ЕООД + договор за наем) end-to-end, за да валидирам подхода преди масово мигриране.