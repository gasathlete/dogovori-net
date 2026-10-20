# Функционален тест „всичко отключено“ — 20.10.2026

## Финална CI проверка на кода

За source `fe55412d94c15aa672ffd9dd2aaf5781436a5f2e`: GitHub Tests `39408617814` success — **2112 app passed / 4 existing skipped, 1062 edge passed / 0 failed**, typecheck стъпката и wizard audit без CRITICAL. Build & SEO `39408617672`, Static catalog sandbox `39408617806`, Security scan `39408617990` success. Security shield `39408617756` остава failure за известния dependency advisory. Няма MAIN runtime deploy/правна migration/отваряне на флагове; докладът не се представя като доказателство за публично работещ анализ или покупки. Следващата промяна е само този отчет, без нов код.

## Точна диагноза на оставащата пречка — root, 20.10.2026

Тази секция заменя предишното „липсващият акт не е установен“ с независимо възпроизведена причина.

- Read-only staging доказателство: `eu_op_gdpr_consolidated` е одобрен с `law-pdf-v2`; текущият документ е `law-pdf-v2:b7bc47d01ff1b45d`, 221 части с 768 измерения, 16 C1 маркера, поправените чл. 14/80 са в индексирания текст. Последният snapshot със същия действителен SHA-256 `b7bc47d01ff1b45dbe1a5ecf42279bb76d8777def579902276c793a32ff93a65` още носи `law-pdf-v1`.
- Root изпълни действителните staging `verifyRegisteredSource`/`loadCoverageInventory`/`evaluateLegalCoverage` върху изчетените DB метаданни и по 10 действителни embedding реда на текущ документ (без запис/AI/HTTP): ОРЗД → `snapshot_untrusted`; КТ/ЗЗД/ЗЗЛД/ГПК са налични; текущият синтетичен трудов документ → employment → `required_law_unavailable`, липсва САМО ОРЗД. Това е възпроизвеждане с in-memory query adapter върху DB снимка, не нов live review. Хипотезата за ЗДДС е отхвърлена за този employment профил.
- Приетият реален v2 ingestion е `252c2ec4-7cc7-459c-b51b-2953274a04fd`, 23.09.2026 07:28:47–07:29:02 UTC, HTTP 200, 1 008 425 bytes, changed=221. Старият snapshot не е преетикетиран и не е симулирано ново извличане. Правилната корекция е ново реално извличане/обработка v2 и нов receipt, който пази действителния SHA, parser и време.
- В кода на монитора е намерена същата checksum-only логика: `decideSnapshot` връща unchanged при еднакви bytes, без да отчита parser. MAIN source поправка: при различна/липсваща версия на parser се иска нов snapshot; caller вече чете и подава `parser_version`. Старите двуаргументни извиквания са съвместими; текущият production caller подава версията. Три нови regression теста + 26 съществуващи monitor теста минаха независимо с Node adapter (29/29). Това предотвратява този вид пропуск в monitor кода; не се твърди, че всички отделни law-file ingestion пътища са проверени или че текущият staging snapshot е поправен.
- **Главната среда изостава значително:** read-only MAIN query установи 5 registry реда, **0 snapshots**, **0 legal_sources с current_version**; 21 legacy source реда са индексирани последно на 11.06.2026. MAIN code registry няма `eu_op_gdpr_consolidated`. Това е отделна действителна пречка за строгото правно заземяване, независимо от gate флаговете/REVIEW_GRANT_SECRET. Staging готовността не се наследява автоматично.
- Пълните GitHub Tests `39407487614` за `b2bb99d94d3d88222526935e21857ec375a320c7`: **2112 app passed / 4 existing skipped**, **1059 edge passed / 0 failed**; Build & SEO `39407487608`, Security scan и Static catalog sandbox са success. bun.lock е точният v3 blob `a260168a413111af4d4dd680a9943e88f883606d`. Security shield остава failure за известния braces advisory (не е потиснат).
- Подготвен е конкретен runbook `docs/operations/launch-unblock-2026-10-20.md`. Няма production DB writes, edge deployment, активирани флагове или нови платени Lovable agent задачи в root продължението.


## Актуализация: поправка на generate → review — 20.10.2026

**Кодът е поправен; пълният публичен AI/платежен старт още не е доказан.** Тази актуализация има предимство пред по-старите резултати по-долу. Не е внедряване на MAIN edge функции.

- Staging source `b58f273be1ac11b1ec578bf7033392ad54fe9478`: нов чист helper `generator-output-tokens.ts`. Един проход възстановява само точните лични маркери от мапинга на текущата заявка; непознатите за мапинга разпознати лични маркери стават видими празни полета. Работи и с празен мапинг. Не се сканират повторно възстановените стойности. Суми, срокове, клаузи и непознати нелични маркери се запазват.
- Открит е отделен дефект: grant се подписваше върху `flattenGeneratedContract`, а реалният клиент изпраща `contractToPlainText`. Grant вече е обвързан с `renderCanonicalPlainText`, който съвпада с клиента; техническият flatten за risk/quality остава непроменен.
- В MAIN поправката се прилага към изхода на generate-contract, build-custom-contract, apply-corrections, refine-contract и generate-linked-document. Трите погрешни издателя на grant (generate/build/apply) използват четимия текст. Refine вече използваше правилния текст. Linked отказва не-обектен AI отговор преди финализиране. Не е копиран целият стар staging handler върху по-новия MAIN; намеренията, юридическите проверки и ledger логиката са запазени.
- Няма промяна на входната redaction защита, потвърждението, подпис/собственост/nonce, роли, платежни доказателства, одобрения, live флагове, цени, package.json или bun.lock. MAIN REVIEW_GRANT_SECRET не е добавен в тази задача; последната проверка установи липса. MAIN edge deploy на тези пет handler-а остава неизпълнен.
- Staging: 8 нови + 16 съществуващи Deno теста и typecheck на generate-contract са отчетени като успешни. Root усили теста за валиден/подменен/чужд grant, добави проверка за кавички/нови редове и независимо изпълни **9/9** върху действителните чисти production модули с Node adapter (само Deno.test/standard assert са адаптирани; не се представя като Deno или пълен E2E). Синтаксисът на петте MAIN handler-а мина Node strip-types --check. Новите тестове се включват от съществуващия CI glob `_shared/*.test.ts`; точният GitHub CI статус се проверява след commit.
- Реален staging повторен тест, source `3f25fa627f330f28b6461bd0cda728713ae632ad`: след минимална synthetic quota fixture генерирането върна 200 за ~10 s, 2515 знака, **0 reserved tokens**. Заявката с реалния frontend текст и grant стигна до coverage проверката: **409 required_law_unavailable**; повторението също 409; подменен текст **403 invalid_grant** (~0.28 s). Няма успешен review моделски отговор, следователно няма доказано replay на успешен резултат. Втори диагностичен опит е отказан 429 rate_limited без модел.
- Точният липсващ акт НЕ е установен: пълното coverage тяло не е записано. ЗДДС/условни закони са хипотези от статичен анализ, не установена причина. Staging има допълнителен coverage gate спрямо текущия MAIN review handler; не се твърди, че същият 409 е възпроизведен в MAIN.
- Fixture: staff test профилът започна с 5 използвания и 0 bonus; добавени минимални bonus credits през service SQL след 403 на admin RPC, един е използван за синтетичната генерация, неизползваният е премахнат. Финал: 6 използвания, 0 bonus. План/роли/абонамент/глобални лимити не са променени. Wrong-owner остава offline-only. Общо 6 реални AI извиквания днес (асистент + пет генерации), нито един успешен review model call; няма истински плащания/имейли/подписи.
- Следващи отделни условия за пускане: MAIN edge deploy + собствен server-only REVIEW_GRANT_SECRET; установяване/възстановяване на конкретния липсващ проверен правен източник и успешен generate→review→cached-result тест; реален source-attestation тест преди включване на платените AI продукти; точни регистрирани static файлове/цени; DTrust покана/OTP/подпис/сертификат с проверена тестова поща.
- Кредитен отчет: известната натрупана оценка 90.8 + отчетени 7.2 за поправката + 4.4 за повторната проба = **около 102.4/100**. Целевите бюджети не ограничиха реалния разход на Lovable; root допусна превишение и спря новите платени задачи. Следващите source промени/проверки са директно през GitHub/local, без нов Lovable agent run.


## Окончателно обобщение от root — 20.10.2026

**Резултат: не е доказано „всичко отключено“.** Провереното ребрандиране и единният статус са публикувани; недовършените продукционни операции остават затворени. По-долу има исторически проверки от отделните изпълнения; това обобщение включва и отделния staging проект.

- UI release: `e6d813182a9d411c800d1b9731e33dfa56779323`, deployment `b5f98953-984b-4b89-8607-0a7bfa0b293f`. Независим браузърен преглед на https://dogovori.net/ потвърди H1, /catalog CTA, търсене „разписка“, еднакъв статус в резултатите и /shablon/razpiska-za-poluchena-suma, и действителната /produkti с продуктови карти. Не се твърди индивидуален прочит/проверка на 625 правни текста.
- За същия UI SHA GitHub Tests 39402026554 и Build & SEO 39402026458 са success; Security scan и Static catalog sandbox също са success. Security shield остава failure за известната build/dev braces GHSA-vfj7-8cjw-p6xm; проверката не е потисната и не се твърди пълен security clearance.
- MAIN checkout поправки `c68fee7a52635cf2360bebacfb59cb74e2f9cb79`: 45/45 целеви интеграционни/guard теста + 3/3 проверки за staff клиента и typecheck; трите handler-а са внедрени и връщат OPTIONS 200 / unauthenticated POST 401. Положителният staff TEST checkout е доказан в staging, не повторен с main staff сесия. Главните флагове, роли, приемания и цени не са променяни.
- След sandbox пренаписване root възстанови точния проверен Bun v3 blob `a260168a413111af4d4dd680a9943e88f883606d` в commit `0d493dd91dabae3413285f488f3898ebc06f6d1c`. Blob-ът на package.json е съпоставен с първоначалния и е еднакъв. Това е възстановяване на вече проверения файл, не ново обновяване на зависимости; не се твърди нов frozen-install run в root средата.

### Реални проби в изолирания staging
Каноничен staging отчет: `docs/operations/staging-open-features-2026-10-20.md`, последен прочетен source `e2989449ae136d54f68e4cb66ff7170aa94a159b` в проект `d134f73e-c926-4401-a32b-a648e4ad7a1c`.

| Път | Реално доказателство / граница |
|---|---|
| Асистент | Реално AI извикване, HTTP 200 / SSE. Това не доказва продукционно включване или правна точност на всички отговори. |
| Генериране | Реални фиктивни примери, HTTP 200 с документ и обобщение на риска. След добавяне на нов server-only staging REVIEW_GRANT_SECRET се издава валиден обвързан grant. Стойността не е изнасяна. |
| Анализ след генериране | Няма успешен AI review резултат. Неразпознат/двусмислен тип е спрян с 409 legal_coverage_incomplete/domain_unknown. Поддържан трудов пример е спрян с 422 context_not_redactable за служебни маркери като <EGN_2>/<ADDRESS_1> в генерирания текст. Не е заобикаляна защита и не е подменян подписаният текст. |
| PDF/DOCX | Действителни browser exporter-и върху фиктивен документ; файловете са генерирани и текстът е извлечен обратно с пълна кирилица и подписи. Това е доказателство за exporter-а, не за платена доставка/квота/история. |
| Абонамент | След staff поправката: реална Stripe TEST subscription session 200, livemode=false, 12.90 EUR, staging return URL; изтекла неплатена. Не е завършено абонаментно плащане. |
| AI продукт checkout | Timeout 504 е отстранен. Валидна staff заявка връща 503 checkout_disabled за около 2.05 s, без Stripe сесия/запис; trusted-source bridge остава затворен. Това е правилно отказване, не успешно закупуване. |
| Статична покупка | Реалният TEST paid→повторно изтегляне→refund→отказ и чужд потребител са доказани на 19.10; не се представят като повторени на 20.10. |
| DTrust Basic | Схемата е проверена, но действителната покана/OTP/подпис/отказ/сертификат не са изпълнени: няма проверен тестов email sink. Липсата на B-Trust/QES ключ не е обявена за пречка за SES Basic. |

Общо 5 реални AI извиквания в staging днес (асистент + четири генерирания); няма успешен моделски review. Няма реални клиентски плащания, имейли или подписи. MAIN REVIEW_GRANT_SECRET е проверено липсващ; staging ключът не е пренасян в MAIN. Остават source-binding/checkout готовност, окончателни файлове за статична продажба, grant конфигурацията в MAIN, съвместимостта generate→review/типове документи и DTrust email E2E.

---

Source SHA: `b908d5f22311c58b9a968bad41e1033dddad657e` (CI поправката `--node-modules-dir=auto` е запазена). bun.lock blob `a260168a413111af4d4dd680a9943e88f883606d` (v3) — непроменен.

**Главно: не успях да създам безопасна среда, в която всичко е отключено.** От тази сесия нямам достъп до изолирания staging проект `d134f73e…` (база, функции, тайни). Главната среда споделя production базата, затова не включих флагове и не пуснах заобиколни пътища. Production не е отключен.

## Проверки
- Unit (Vitest), първи път: 2097 успешни, 15 неуспешни, 4 пропуснати.
- Unit след поправка на остарелите тестове: **2112 успешни, 0 неуспешни, 4 пропуснати (168/168 файла)**. Шестте файла вече проверяват новото правило: /catalog + аналитика, един златен CTA, /build и /analiz с „В подготовка“, без auth за разглеждане, без обещания „безплатно/3 минути“, цени и „Покупките още не са активни“, бланка линк с blank=1.
  - Всичките 15 са в `gate8PublicOffers`, `mobileConversion`, `p2Conversion`, `positioningOffer`, `productResultPreview` и `seoTemplateIntent`. Те проверяват текстове в кода от старото позициониране: `/start`, „Започнете безплатно“, „Създайте документ“, „Вижте как работи“, „Изготви за 3 минути“, `blankWizardHref`, `SEO_INTENT_SUPPORT_LINE`.
  - Няма функционален срив. Тестовете противоречат на по-новото решение на собственика (позициониране около ежедневната бюрокрация и статус за целия каталог). Поправени са (виж следващия ред).
- Edge (точните CI флагове): 1046/1046. `deno check` за generate-job, draft-sync, draft-claim, payments-webhook, create-product-checkout и static-catalog: OK.
- Браузър (локален preview, desktop 1280 и mobile 390): 10 страници. Няма хоризонтално преливане. Предупреждението „Проверете внимателно преди подписване“ се вижда в /catalog и в два различни образеца. Статусът „затворено“ се вижда на началната страница, образците и /plans.
- Живи сървърни функции, без вход: static-catalog 401, create-product-checkout 401, грешно име `ai-assistant` → 404 е грешка в теста, не в услугата. Правилните `assistant-chat`, `assistant-chat-anon` и DTrust функциите (`create-signing-request`, `get-signing-request`, `sign-shared-document`, `signer-action`, `signing-owner-action`) отговарят на OPTIONS с 200: адресите съществуват. Това не доказва версия, работа или E2E.

## Таблица
| Функция | Наблюдаван gate | Отворена тестова среда | Резултат | Вид | Статус | Точен блокер |
|---|---|---|---|---|---|---|
| Каталог, търсене, образци | няма | не е нужна | отварят се, еднакъв статус | real (локално) | READY | — |
| Бланка PDF/DOCX | prelaunch, пътят минава през AI | няма | CTA показва „в подготовка“ | source+UI | BLOCKED | няма приет static asset; AI пътят е затворен |
| /analiz качване и преглед | AI gate | няма | страницата се отваря, обработка не е тествана | UI | NOT TESTED | AI доставчик/DPA и staging тайни недостъпни |
| Асистент | AI gate | няма | само UI | UI | NOT TESTED | същото |
| 3 AI продукта → checkout | checkout 401 без вход; флаговете OFF | няма | отказ без вход | real | BLOCKED | live цени има (19.10: contract_check `price_1UFXSTQ7izR0PPEqm8hViQEZ`, contract_improve `price_1UFXSQQ7izR0PPEqXtvzHz94`, negotiation_package `price_1UFXSUQ7izR0PPEqe4oQHRHi`); 401 доказва само отказ без вход. Активирането на checkout/доставка не е доказано |
| Static покупка, повторно сваляне, refund | `STATIC_CATALOG_*_CHECKOUT_ENABLED` липсват (OFF) | staging, по-рано | записано по-рано: TEST 4242, refund, replay, грешен потребител — всичко мина (не е пуснато отново) | real staging (по-рано) | BLOCKED за live | няма приет static файл и съвпадаща static цена; активирането не е доказано |
| Планове / абонамент / портал | покупките са затворени | няма | показва „затворено“ | UI | BLOCKED | предварителният режим заключва покупки |
| Запазени документи / история | изисква вход | няма | не е тествано | — | NOT TESTED | в тази сесия не е създадена тестова сесия; база = production |
| DTrust Basic | неразгърнато, по доклад от 14.10 | няма | страницата се отваря; адресите отговарят (OPTIONS) | UI | NOT TESTED | разгръщане на текущата версия и E2E не са проверени; имейлът не е проверен |

## Отделно
- Braces GHSA-vfj7-8cjw-p6xm: само в build/dev инструментите; няма публикувана поправка. Не блокира UI готовността.

## Какво трябва за истински отворен тест
1. Достъп до staging `d134f73e…` от тази сесия или от родителя.
2. Там: AI тайни, разгърнати DTrust функции и тестова пощенска кутия.
3. Отворените пътища (AI, checkout, доставка, DTrust OTP) остават непроверени; отказ или отворена страница не е функционален успех. Staging проверката се прави отделно от родителя.

## Поправки в MAIN след staging репетицията (20.10.2026, 2-ри проход)
Публикуван UI: root deployment `b5f98953-984b-4b89-8607-0a7bfa0b293f` от `e6d813182a9d411c800d1b9731e33dfa56779323`; root провери в браузър на dogovori.net новия hero, търсенето в каталога, еднаквото предупреждение в резултати/образец и `/produkti`. **Корекция:** правилният адрес е `/produkti` (не `/products`); там има реално заглавие и карти на продуктите, не 404.

A) **Staff sandbox checkout 403.** `create-checkout`, `create-strict-unlock-checkout`, `create-product-checkout` викаха `assertEnvironmentAllowed` с потребителски клиент, а `public.is_staff` EXECUTE е отнет от authenticated → всички staff sandbox опити 403. Сега: service-role клиент без препратен потребителски Authorization, userId от вече проверения JWT. Ред на auth, флагове, source binding, URL allowlist и pinned npm Stripe са запазени; роли/grants/`is_staff` SQL не са пипани. Тест `_shared/staff-check-client.test.ts` 3/3.

B) **504 CPU в `productPrepaymentBlockers`.** Сега fail-fast: `productCheckoutBlockers` (вкл. `checkout_disabled`) → връща веднага; после `productTrustedSourceBlockers` → връща веднага; само без тях се пускат всички скъпи проверки (миграция, правна база, местопребиваване). `PRODUCT_TRUSTED_SOURCE_BRIDGE.available=false` е непроменен; `productIntegrationReadiness` и fulfillment агрегирането не са променени. Тестовете с отворен мост ползват само вътрешен 4-ти параметър (не HTTP/тяло/env). Нов тест с капан доказва 0 скъпи извиквания при фатален евтин блокер.

C) **REVIEW_GRANT_SECRET в MAIN: липсва** (проверено само име). Предпоставка: тайната трябва да се добави сигурно в MAIN преди генерирането да може да издава review_grant. Стойност не е създавана/показвана.

Проверки: Deno sandbox-guard + product-integration + product-gates.handler 45/45, staff-check 3/3; `deno check` на трите handler-а OK. App source не е променян → без повторен пълен app suite (2112/4 skipped; GitHub Tests 39402026554, Build 39402026458 за e6).
Deploy само на трите handler-а. Source SHA-256 (deploy): create-checkout `ca202e9d…f7b4`, create-strict-unlock-checkout `e9508a20…f985`, create-product-checkout `2e26d40b…6816`. Runtime: OPTIONS 200 и неавтентикиран POST 401 и за трите. Prod флагове не са променяни; не са създавани Stripe сесии, клиенти, имейли; live покупка не е опитвана.

**Присъда остава:** production не е „всичко отключено“; staff sandbox checkout в MAIN след поправката не е проверен с реална staff сесия от тук.

## MAIN deploy/config preparation — 20.10.2026 (source base e405b925…, sandbox HEAD 15c08a87…)

- Secret inventory (names only): REVIEW_GRANT_SECRET was absent → generated new 64-char server-only random value via the platform generator. Not copied from staging, not shown anywhere. No other secret touched/rotated.
- Fix: `_shared/legal-force-markers.test.ts` fixture `NOW` changed from `Date` to epoch ms (`Date.parse`) to match promoted `assessChunkForce(content, now: number)`. No assertion changed.
- Focused Deno (legal/source/grant/token/monitor/attestation shared tests + review-document): 249/249 pass (2 tests read repo-root paths; pass when run from root, 14/14). `deno check` clean for all 12 deployed entrypoints.
- bun.lock blob unchanged `a260168a413111af4d4dd680a9943e88f883606d`; no package/install changes.
- Deployed (submitted source SHA-256): generate-contract 67cfcbf2…0826; build-custom-contract 73668af7…defa; apply-corrections 3c7b0fb2…c142; refine-contract 2b69cb15…82c4; generate-linked-document 16279ea3…ce; review-document dfe0e022…a83; analyze-contract 31d5c668…2c6; assistant-chat 3d6978e0…67; assistant-chat-anon 265175b3…94; legal-source-monitor b70dfd55…082; plus fetch-legal-source 5667bddc…af3 and ingest-legal-source 038a2556…04b (same shared legal modules).
- Endpoint smoke only (not E2E): OPTIONS 200 on all 12. Unauth empty POST: 401 on 9; generate-contract and review-document 400 (body validation precedes auth, no model call); assistant-chat-anon 503 (public flag closed, unchanged).
- Not changed: public processing/payment flags, legal corpus, schema/data migrations, roles/approvals, frontend publish.
- Readiness limitation: MAIN not ready for generate→review until root verifies corpus promotion (expected 7 current laws / 3563 chunks; earlier 0 snapshots). No real generate/review call made in MAIN.
