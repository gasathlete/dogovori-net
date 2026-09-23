# Предварителен режим: общ списък за заявки вместо всички незащитени функции

База: HEAD `b3f0c6ab3eb289693f4e18d801277bf5ec1b83fd`. Само изходен код. Без публикуване, без запис в базата, без промени в настройките, без реални AI/плащания/имейли. Флаговете остават OFF. Gate 7–10 остава **NOT_READY**. Планът не твърди правно съответствие; това изисква становище от юрист.

## Правило за класификация

- **A. Показвай свободно (безопасност доказана в кода):** статично публично съдържание, което не приема лични данни, не извиква AI или плащане и не качва файлове. За правно съответствие не се твърди нищо.
- **B. Заменя се с предварителна заявка:** всичко, което създава реален документ, извиква AI, приема плащане, създава профил или обработва лични данни, сваля бланка, подписва или споделя.
- **C. Трябва одит (засега се третира като B):** неясно поведение или странични ефекти.

Причините по-долу са рискови категории: нужна е правна основа, договор с обработващ, AI Act, потребителско право, PSD2/Stripe или условията на Lovable за лични данни. Те не са правни изводи.

## Матрица по маршрути

| Маршрут / CTA | Клас | Причина | Контрол сега | Риск от заобикаляне |
|---|---|---|---|---|
| `/`, `/catalog`, `/kategoria/:slug`, `/sektor/:id`, `/shablon/:slug` (текст), `/rechnik*`, `/blog`, `/blog/:slug`, `/proces/:slug`, `/sravni*`, `/karta`, `/tools`, `/tools/:slug` (калкулатори, само в браузъра) | A | само SEO съдържание | няма нужда | нисък; калкулаторите трябва да се проверят за мрежови заявки (C, докато не се проверят) |
| `/legal*`, `/privacy`, `/terms`, `/cookies`, `/dpa`, `/refund`, `/usloviya-za-pokupka`, `/provider-info`, `/withdrawal-form` (само четене), `/contacts` | A | публични правни текстове (собственикът потвърди, че са предназначени за публично четене) | няма нужда | нисък |
| `/demo/*` | C | да се провери дали демото е само статично | client | среден |
| `/produkti`, `/produkti/:slug`, `/plans` (текст и цени) | A | цени от `products.ts`/`pricing.ts` | client | нисък |
| `/produkti/:slug/start`, `/checkout/return`, `/produkti/rezultat`, `/produkti/moite-pokupki`, бутоните за абонамент/топъп в `/plans` | B | плащане, AI, лични данни | client флаг `ONE_TIME_PURCHASES_AVAILABLE=false`; server rollout флагове OFF | `create-checkout`, `create-strict-unlock-checkout` и `create-team` нямат потвърден server флаг (C) |
| „Изтегли бланка“ (`Template` 297, `Wizard` 1296/1370/1381/1505, `LiveDraft` 83, `FeaturedBlanks` 148, `CompanionChip` 47), `/downloads/*` | B | AI, профил, лични данни | auth + client | `download-blank`/`download-document` могат да се извикат директно |
| `/wizard/*`, `/wizard-bilingual/*`, `/wizard-graph/*`, `/build`, `/start` (генериране) | B | реален документ, AI | auth + privacy gate | `generate-job`/`generate-contract`/`build-custom-contract` могат да се извикат директно; `anonymous_drafts` приема директен запис |
| `/analiz`, `/analyze`, `/console/*`, `/uploaded/:id`, `/moite-revyuta` | B | качване, AI, лични данни | Gate 8 блокира в client | `analyze-contract`, `correct-uploaded`, `ocr-contract`, `review-document`; директен запис в `uploaded_contracts` и storage |
| `/assistant*`, `/ai`, DogovaryAI (мобилна навигация) | B | AI, лични данни | privacy gate на server | `assistant-chat(-anon)` могат да се извикат директно |
| `/auth`, `/account`, `/dashboard`, `/team*`, `/reset-password`, Google вход | B (регистрацията се спира; вход остава за съществуващи потребители → C) | профили и лични данни | няма флаг | създаване на профил директно през Auth API |
| `/sign/:token`, `/signing/:id`, `/verify*`, `/share/:token`, `/document/:id`, `/komplekti/nov`, `/komplekti/moi/*`, `/contact/:id`, `/workspace/*`, `/connect`, `/blog/submit`, `/feedback` | B | лични данни, подпис, UGC | auth | съответните edge функции са пряко достъпни |
| `/komplekti`, `/komplekti/:slug` (текст) | C | — | — | — |
| `/unsubscribe`, `/.lovable/oauth/consent` | A (трябва да работят) | права на субекта | server | нисък |
| `/admin/*` | остава само за персонал | — | роли (server) | извън обхвата |
| Бюлетин / lead magnet | C | съгласието вече е изрично; изпращането на имейли е спряно | RPC | — |

**API функции (директни извиквания):** публичните функции за AI, плащане и документи трябва да върнат **503 `prelaunch_disabled`** преди всякаква работа, чрез нов общ `_shared/prelaunch-gate.ts`:
- AI и документи: `analyze-contract`, `apply-corrections`, `assistant-*`, `build-custom-contract`, `correct-uploaded`, `download-blank`, `download-document`, `draft-*`, `generate-*`, `negotiation-strategy`, `ocr-contract`, `refine-*`, `review-document`, `suggest-followup-questions`;
- плащане и екипи: `create-*checkout`, `create-team`, `team-*`, `customer-portal`;
- подпис и споделяне: `create-share-link`, `create-signing-request`, `sign-shared-document`, `signer-action`, `get-signing-request`, `get-shared-document`;
- други: `submit-user-article`, `lookup-eik`, `mcp`.

Остават непроменени: `payments-webhook` (трябва да обработва и реверси), `delete-account`, `export-my-data`, `handle-email-unsubscribe`, `auth-email-hook`, cron функциите и функциите само за персонал.

Функциите са gated **в кода, но не са внедрени**. На живо заобикалянето остава възможно до контролирано внедряване. Директните записи в таблици и storage не се затварят без миграция 0044 и storage политика (отворено).

## Общ списък за предварителни заявки

**Един компонент `PrelaunchWaitlistDialog`** замества всички CTA от клас B. Съдържа:
- текста на собственика дословно;
- поле за имейл;
- отделна отметка, която не е предварително отметната;
- връзка към поверителността.

Текстът не обещава функционалност, дата или отстъпка.

**Запис:** само чрез нова SECURITY DEFINER RPC `request_prelaunch_waitlist(_email, _feature, _consent)`. Тя пише в `prelaunch_waitlist`:
- полета: email, feature (от фиксиран списък), consent_version, consent_at;
- без IP, UA или име;
- `unique(email, feature)`, повторна заявка не създава нов запис;
- RLS включен без политики; анонимните потребители нямат директен достъп; `service_role` има ALL.

Миграцията е сдвоена в две идентични копия и влиза в манифеста. **Не се прилага.** Докато не е приложена, диалогът казва честно, че заявки още не се приемат.

**Отказ и изтриване:** RPC `withdraw_prelaunch_waitlist(_email, _token)` със знак за еднократна употреба. Имейл не се изпраща, затова в UI отказът засега е чрез контакт/DPO, а персоналът изтрива от `/admin/privacy`. Връзката в имейла остава за по-късно, когато изпращането бъде одобрено.

**Срок на съхранение:** оставя се `null` с TODO „изисква правно одобрение“. В кода няма твърдо зададени 12 месеца. Текстът в Поверителност, ROPA и Срокове за съхранение се подготвя като **чернова, маркирана за юрист**, и не се публикува като окончателен.

**Без изпращане:** никакви имейли, външни mail или analytics услуги. Разрешено е само вътрешно събитие без лични данни `waitlist_submitted{feature}` през `metrics.ts`, при дадено съгласие.

## Технически детайли и файлове

1. `src/lib/prelaunch.ts`:
   - `PRELAUNCH_MODE = true`;
   - `PrelaunchFeature` (фиксиран списък);
   - `isFeatureAvailable()`, fail-closed;
   - текстове и версия на съгласието.
2. `src/components/prelaunch/PrelaunchWaitlistDialog.tsx`, `openPrelaunchWaitlist()`, `PrelaunchGate` (обвивка за маршрути).
3. Свързване:
   - `Wizard.tsx` (преди `requireAuth`/disclaimer/invoke);
   - `LiveDraft`, `Template`, `FeaturedBlanks`, `CompanionChip`;
   - `Analyze`, `Assistant`, `AssistantChat`, `ProductCheckout`, `Plans` (бутоните);
   - `Auth` (само регистрацията);
   - `Header`/`Hero`/`MobileBottomNav`: петте позиции остават; „Изготви“ и DogovaryAI отварят диалога;
   - маршрутите от клас B в `App.tsx` се обвиват в `PrelaunchGate` с `noindex`.
   SEO страниците остават индексируеми, със същите заглавия и canonical адреси.
4. `supabase/functions/_shared/prelaunch-gate.ts` плюс една проверка в началото на всяка функция от списъка. Server флагът се чете от env и **по подразбиране е затворен**, без промяна в конфигурацията.
5. Сдвоена миграция `prelaunch_waitlist` + двете RPC + запис в манифеста. Не се прилага.
6. Тестове:
   - `prelaunchMatrix.test.tsx`: всеки CTA от клас B отваря диалога и не вика invoke/rpc извън waitlist;
   - `prelaunchWaitlistDialog.test.tsx`: съгласие без предварителна отметка, невалиден имейл, грешка → честно съобщение, текстът е дословен, без „%“ и без дата;
   - Deno handler тест за 2 представителни функции (`download-blank`, `create-checkout`): 503 без DB/модел/Stripe;
   - тест, че двете копия на миграцията са идентични;
   - обновяване на засегнатите съществуващи тестове.
   След това typecheck, пълен vitest, Deno и build. Накрая sitemap файловете се възстановяват байт по байт.
7. Първа стъпка от изпълнението: одит само с четене на редовете от клас C (калкулатори, демо, комплекти, вход, `create-checkout`/`create-team` флагове) и сравнение със схемата на живо само с четене. Резултатът прекласифицира в A или B.
8. `roadmap.md` се обновява при изпълнението (в режим на планиране не мога да го редактирам).

## Production readiness: остава отворено

- Становище от юрист за целта, основанието, срока и текстовете.
- Прилагане на миграцията и внедряване на edge gate-овете (Ваше решение).
- Миграция 0044 и storage политика за директните записи.
- Проверка на живо, че маршрутите от клас B не са достъпни.
- Мобилна проверка и проверка на десктоп.
- Бъдещ одобрен процес за уведомяване и автоматично изтриване по одобрен срок.
- Gate 7–10 остава NOT_READY.
