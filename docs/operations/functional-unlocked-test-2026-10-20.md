# Функционален тест „всичко отключено“ — 20.10.2026

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
