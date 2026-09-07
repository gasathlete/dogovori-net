# Stage 2 — архитектурен одит на фунията (само доклад + план)

База: HEAD `6e575906f496c1e5b1b0242f735f6e89fe2bc8d2`. Само четене на код и миграции — без deploy, без база, без външни услуги.

## 1. Къде се отчита днес (production call sites)

127 извиквания извън тестовете, в 23 файла:

| Слой | Файлове |
|---|---|
| Инфраструктура | `src/lib/funnel.ts` (`trackFunnelEvent`, `getFunnelSessionId`, `signup_completed`), `src/lib/funnelEvents.ts` (канонични имена, дедуп, санитизация), `src/lib/docFunnel.ts` (всички `track*` помощници), `src/lib/metrics.ts` (`checkout_started`, `checkout_failed`, `upgrade_completed`, `plans_view`), `src/lib/ab.ts` |
| Документен поток | `src/pages/Wizard.tsx` (`trackDocStart` 872 през `markDocSelected`, `trackFillStep` 1428/1524, `trackGenerate` 413–…, `trackResultViewed` 520, `trackPaywallShown`, `trackAuthPromptShown`, `trackDocumentSaved`), `src/pages/BuildContract.tsx` (206, 518–613, 601, 672/689/762/895), `src/pages/UploadedContract.tsx`, `src/components/UploadContractDialog.tsx` (134) |
| Вход/чернови | `src/components/auth/InlineAuthDialog.tsx`, `src/hooks/useActivationDraft.ts` (`trackDraftEvent`: created/autosaved/restore_offered/restored/sync_blocked/expired/claim_*) |
| Сваляне | `src/lib/downloadDocument.ts` (`trackDownload` 46–200) |
| Плащане | `src/components/StripeEmbeddedCheckout.tsx` (54), `src/components/wizard/StrictDocumentPaywall.tsx` (70–71), `src/pages/CheckoutReturn.tsx` (85 `trackCheckoutCompleted`) |
| Вход в фунията | `src/pages/Template.tsx` (`template_intent_panel_viewed`, `template_create_cta_clicked`, `template_blank_preview_clicked`), `src/components/Hero.tsx`, `src/pages/Start.tsx`, `src/pages/Analyze.tsx`, `src/components/funnel/*`, `src/components/onboarding/OnboardingTour.tsx` |

`trackCanonical` се вика само вътрешно от `docFunnel.ts` (единствен вход към `STORED_NAME`).

## 2. Семантика, пропуски, дублирания

Работи добре: канонични имена + историческо записване, `dstage`, дедуп `ONCE_PER_SESSION_DOC`, gate-vs-fail нормализация, no-PII санитизация.

Потвърдени проблеми:

- **`session_id` не е сесия.** `getFunnelSessionId()` (`funnel.ts` 124–144) чете/пише `funnel_session_id_v1` в **localStorage** без TTL и без ротация → това е траен идентификатор на браузър. Всички SQL показатели „сесии" (`COUNT(DISTINCT session_id)`) реално са „браузъри за периода". Отделно `src/lib/opSession.ts` държи истински per-tab `op_session_id` в sessionStorage — двата модела не са свързани.
- **`doc_start` (stored име за `document_selected`) остава надут по три причини:** (а) историческите редове от преди затягането на семантиката са в таблицата и никой разрез не ги разделя по дата/версия; (б) дедупът е само клиентски — `claimOnce` при недостъпен localStorage (private mode, quota, ITP изчистване) връща `true` при всяко извикване, т.е. без ограничение; (в) коментарът в `funnel.ts` 229–232 твърди, че има „уникален индекс като втора защита", но в миграциите такъв **няма** — единствените индекси са `created_at`, `step`, `name`, `session_id`, всички неуникални. Няма и `schema_version`, така че старите и новите семантики са неразличими в едни и същи агрегати.
- **Два паралелни слоя.** `docFunnel` (канонично + дедуп + `props.event`) и `metrics.trackMetric` (`checkout_started`, `checkout_failed`, `upgrade_completed`, `plans_view`) пишат в същата таблица без `props.event` и без дедуп. `upgrade_completed` идва и от `metrics.trackUpgradeCompleted`, и като stored име на `checkout_completed` от `CheckoutReturn` → двоен източник за един и същ показател.
- **Consent несъответствие.** `trackEvent` (GA) е зад `getCategoryConsent("analytics")`, но записът в `funnel_events` в `trackFunnelEvent` се прави безусловно. Изисква решение (виж блокери).
- **`signup_completed`** се извежда евристично от `created_at` в последните 15 минути (`funnel.ts` 167–179) — при бавен вход или повторен клиентски boot може да липсва; няма сървърно потвърждение.
- `wizard_start` (`Wizard.tsx` 861) отива само в GA, не в фунията — това е добре (mount не е `doc_start`), но означава, че „истинско зареждане на уизард" липсва като етап.

## 3. Може ли пътят да се съедини детерминистично днес — не

Днес всички hop-ове се съединяват само по `session_id` (= браузър) и по `doc_key`. Липсва по хоп:

| Хоп | Липсва |
|---|---|
| шаблон CTA → старт на уизард | няма `journey_id`/`run_id`; CTA и уизардът се свързват само по slug и време |
| старт → попълване → преглед → генериране | няма `document_run_id`, така че два опита по един и същ документ в един браузър са неразличими |
| генериране → auth prompt → signup | `auth_prompt_shown` няма `draft_id` и `run_id`; `signup_completed` няма нито едно от тях |
| signup → claim на чернова | `draft_*` носят `draft_id`, но нито едно друго събитие не носи `draft_id` → анонимно→автентикирано се свързва само по `session_id` |
| сваляне/запазване | `document_saved` носи `saved_document_id` в dedup ключа, но `document_downloaded` не носи нито saved id, нито `run_id` |
| checkout създаден → плащане потвърдено | `checkout_started` (metrics) няма Stripe session id; `checkout_completed` носи `cs:<id>` само вътре в `props.dedup_key`. Нулево пресичане → „checkout completion" в `metrics_overview` дели две несвързани множества |
| повторна употреба | няма нито ден-N маркер, нито `first_seen`/`journey_seq` |

## 4. База: constraints, индекси, RLS, зависими отчети

- `public.funnel_events` (`supabase/migrations/20260629173521_…sql`): `id`, `session_id text not null`, `user_id uuid → auth.users on delete set null`, `step smallint`, `name text not null`, `path text`, `props jsonb default '{}'`, `created_at`. Индекси: `created_at DESC`, `step`, `name`, `session_id`. **Никакви unique constraints, никакъв check извън RLS.**
- RLS: INSERT за `anon, authenticated` с `WITH CHECK (char_length(session_id) 8..128 AND char_length(name) 1..80 AND (step IS NULL OR step BETWEEN 1 AND 4))`; SELECT само за админ през `has_role`. GRANT-ове: INSERT за anon/authenticated, SELECT за authenticated, ALL за service_role (`20260728071700_…`).
- Retention: `purge_old_funnel_events()` + cron `0 3 1 * *`, 13 месеца (`20260811212141_…`).
- Отчети, зависими от **историческите** имена (не се пипат): `metrics_overview` (`20260904210000_…`, преди това `20260811215209`, `20260811212050`, `20260811211714`), `growth_snapshot`, `src/pages/AdminGenHealth.tsx` (106–213), `src/pages/AdminFunnel.tsx`, `src/pages/AdminMetrics.tsx`, `supabase/functions/growth-brief`, `supabase/functions/qa-bot-runner`. Ключови имена: `doc_start`, `doc_fill_step`, `doc_generate_started/success/fail/blocked`, `doc_download_success/fail`, `upgrade_completed`, `checkout_started`, `result_viewed`, `document_saved`, `auth_prompt_shown`, `draft_*`.

## 5. Най-малкият безопасен първи commit (само наблюдаемост)

Без промени по UI, оферти, цени, рутиране, slugs, без нови таблици и без destructive миграция. Всичко ново се добавя **само в `props`**, стоковите имена остават.

**Файлове**

1. `src/lib/funnelContext.ts` (нов) — единен контекст, добавян към всяко събитие:
   - `schema_version: 2` (число, фиксирано в код);
   - `release: string` — от `import.meta.env.VITE_APP_RELEASE`, нормализиран до `^[a-z0-9._-]{1,16}$`, иначе `"dev"` (ограничена кардиналност);
   - `browser_id` — днешният `funnel_session_id_v1` (преименуван само семантично в props, стойността и ключът остават);
   - `tab_session_id` — нов per-tab UUID в sessionStorage (истинска сесия), само в props;
   - `journey_id` — per-tab UUID, издържа до края на таба; свързва landing → CTA → уизард;
   - `run_id` — per (journey, doc_key) UUID, издаван при първото съзнателно действие върху документ.
2. `src/lib/funnel.ts` — `trackFunnelEvent` слива контекста в props; колоната `session_id` остава непроменена (обратна съвместимост); без промяна в дедупа.
3. `src/lib/docFunnel.ts` — прокарва `run_id`/`journey_id`/`draft_id` (когато е известен) към `document_selected`, `wizard_step_completed`, `generation_*`, `result_viewed`, `auth_prompt_shown`, `document_saved`, `document_downloaded`.
4. `src/lib/metrics.ts` — `trackCheckoutStarted` приема опционален `stripe_session_id` и записва `props.event = "checkout_started"`; добавя `checkout_intent_id` (клиентски UUID), който `CheckoutReturn` препредава.
5. `src/components/StripeEmbeddedCheckout.tsx`, `src/components/wizard/StrictDocumentPaywall.tsx` — подават реалния Stripe session/client-secret id (само id, без суми и без PII) в `checkout_started`.
6. `src/pages/CheckoutReturn.tsx` — `trackCheckoutCompleted` получава `stripe_session_id` в props (не само в dedup ключа) + `entitlement_confirmed: boolean` от вече наличната проверка на профила, за да са различими „сесия създадена" и „право потвърдено".
7. `src/components/auth/InlineAuthDialog.tsx`, `src/hooks/useActivationDraft.ts` — `auth_prompt_shown` и `signup_completed` носят `draft_id`, `run_id`, `journey_id`.
8. `src/pages/Template.tsx` — CTA събитията носят `journey_id` и предстоящия `run_id` (без промяна по видимия текст, href, canonical).

**Контракт на събитието (добавъчен, стабилен)**

`props` винаги: `event`, `schema_version`, `release`, `browser_id`, `tab_session_id`, `journey_id`; при документен контекст: `doc_key`, `source`, `run_id`; при чернова: `draft_id`; при плащане: `checkout_intent_id`, `stripe_session_id`, `entitlement_confirmed`. Забранени: суров текст на грешка, имейл, ЕГН, IBAN, съдържание на документ (пази се от `sanitizeFunnelProps`).

**Тестове** (`src/test/funnelContextContract.test.ts` нов + допълване на `docFunnel.test.ts`, `checkoutTracking.test.tsx`)

- всяко събитие носи `schema_version` и валиден `release` с ограничена кардиналност;
- `tab_session_id` е различен за нов таб, `browser_id` — същият;
- `run_id` е стабилен за (journey, doc_key) и нов за нов документ;
- `document_selected` не се отчита при mount/prefetch (запазване на съществуващите guard-тестове);
- `checkout_started` носи Stripe session id, `checkout_completed` носи същия id → детерминистично съединяване;
- stored имената остават байт-идентични на историческите (guard тест срещу `STORED_NAME`);
- нула PII в props при пълен обход на новите полета.

**Rollout / съвместимост**

Само добавяне на props → съществуващите SQL агрегати и админ табла продължават да работят непроменени. Флаг не е необходим за контекста, но новите разрези в отчетите се четат само за `props->>'schema_version' = '2'`, така че старите редове не се смесват. Никаква промяна по схема, индекси, RLS, retention в този commit. Следващ (отделен, неразрушителен) commit може да добави частичен индекс по `((props->>'run_id'))` при доказана нужда.

**Синтетична проверка (само четене) и SQL агрегати**

- Playwright сценарий в `/tmp/browser/funnel-stage2/`, който минава шаблон → CTA → уизард → първи отговор → генериране (mock) → auth подкана и **само записва изходящите payload-и** (без вход в реален акаунт, без плащане), за да се провери контрактът в браузър.
- Read-only SQL за по-късна проверка (не се изпълнява в този одит):
  - `select props->>'schema_version' v, count(*) from funnel_events where created_at > now() - interval '7 days' group by 1;`
  - `select count(*) filter (where name='doc_start'), count(distinct props->>'run_id') from funnel_events where created_at > now() - interval '7 days' and props->>'schema_version'='2';` (надуването се вижда като съотношение > 1)
  - съединяване: `select count(*) from funnel_events s join funnel_events c on c.props->>'stripe_session_id' = s.props->>'stripe_session_id' where s.name='checkout_started' and c.name='upgrade_completed';`

## Блокери за решение от теб

1. **Consent за DB записа.** Днес `funnel_events` се пише и без съгласие за „analytics", докато GA е гейтнат. Да гейтна ли и DB записа (по-чисто спрямо запомненото правило, но ще намали историческите обеми), или да остане както е?
2. **`release` маркер.** Няма `VITE_APP_RELEASE` в build-а. Да го въведа ли като build env (изисква промяна във `vite.config.ts`/CI), или да ползвам фиксирана константа в кода, вдигана ръчно?
3. **Двойният източник за `upgrade_completed`** (`metrics.trackUpgradeCompleted` и `checkout_completed`). Да оставя ли и двата и да ги различавам само по `props.event`, или да спра единия (променя историческия ред на показателя)?
4. **Сървърно потвърждение на плащането.** Наистина детерминистично „право потвърдено" изисква събитие от webhook-а, т.е. backend работа — извън обхвата на този commit. Потвърди дали да го планирам като Stage 2b.
