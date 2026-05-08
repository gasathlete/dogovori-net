
# Pre-launch одит и план за масов пускане на dogovori.net

## A. Критични пропуски (блокери за официално пускане)

### A1. Юридически страници (GDPR / ЗЗЛД / ЗЕТ)
Липсват напълно: **Общи условия**, **Политика за поверителност (GDPR)**, **Политика за бисквитки**, **Информация за връщане/възстановяване** (изисква се при онлайн продажба), **Контакти на администратор на лични данни**.
Препоръка: създаваме `/terms`, `/privacy`, `/cookies`, `/refund` с готови шаблони на български, линкове във Footer + чекбокс при регистрация и плащане.

### A2. Защита на `generate-contract` от злоупотреба
В момента функцията е публична (`verify_jwt = false`) и **без rate limiting**. Всеки може да я ползва като безплатен LLM прокси и да източи AI кредитите. Преди публично пускане:
- Изискваме вход (или капча) за извикване.
- Лимит: 1 безплатна генерация / IP / 24h за анонимни, 5 / профил / ден за free.
- Логваме `user_id` + `ip_hash` в нова таблица `ai_usage` за наблюдение.

### A3. ДДС / Фактуриране за БГ пазар
Цените са в EUR без активирано ДДС събиране. БГ ЮЛ ще искат данъчни фактури. Решение:
- Включваме Stripe Tax (`automatic_tax: { enabled: true }`) — +0.5%, Stripe генерира фактурите.
- В чекаута: `tax_id_collection: { enabled: true }` за ДДС № на фирми.
- Полето `vat_number` в `profiles` вече съществува — пренасяме го към Stripe customer.

### A4. SEO базис (липсва почти всичко)
- `index.html` е с `lang="en"`, общо заглавие, без `canonical`, без `robots`, без JSON-LD, без `sitemap.xml`.
- Няма уникални meta title/description по страница (Каталог, Wizard, всеки документ).
- За масов органичен трафик това е блокер №1.

### A5. Email потвърждение и сигурна парола
- В Auth Settings да включим **Password HIBP Check** (защита срещу изтекли пароли).
- Да изключим auto-confirm email и да активираме верификация на имейл (с брандиран шаблон на БГ).
- Минималната парола да стане 10 символа + изискване за цифра.

### A6. CORS заключване в продукция
Всички edge функции са с `Access-Control-Allow-Origin: *`. Стесняваме до `https://dogovori.net`, `https://www.dogovori.net` и preview домейна.

### A7. Anti-copy защита — визуална, не реална
Текстът в `LiveDraft` блокира copy/paste през събития, но JSON-payload-ът се връща в network отговора и може да се извлече от DevTools. За реална защита:
- Сваляме PDF/DOCX със **steganographic watermark** (user_id + timestamp в footer на всяка страница).
- За non-Pro PDF — voден знак „ПРЕГЛЕД – не за подпис".

### A8. Мъртъв код и дублирана логика
`supabase/functions/save-document/index.ts` не се ползва никъде (Wizard минава през `download-document`, която вече вкарва записа). Премахваме, за да не е attack surface.

## B. Важни подобрения (силно препоръчителни)

| # | Тема | Действие |
|---|------|----------|
| B1 | Customer resolution в Stripe | Преминаваме на `resolveOrCreateCustomer` (с `metadata.userId`), за да работят portal/refund чисто |
| B2 | Рейт лимит на `apply-corrections` | Pro проверката е там, но без брояч — добавяме лимит 50 корекции/ден/Pro |
| B3 | Sentry (или подобно) | Серверни и клиентски грешки да се логват централизирано |
| B4 | Google Analytics 4 + Plausible | За реално измерване на фунията |
| B5 | Brand-shaped имейли | Welcome, password reset, payment receipt — на БГ език с лого |
| B6 | „Забравих какво съм правил" | Автоматично възстановяване на wizard прогреса от `localStorage` (сега е `sessionStorage` — губи се при затваряне на таб) |
| B7 | Експорт на бланка в .DOCX редактируем формат | Сега излиза като PDF — клиенти ще искат и DOCX |
| B8 | „Сподели за подпис" | Изпращане на линк за преглед/подпис до контрагента (Pro фича) |
| B9 | Тестово покритие | Vitest има 1 файл — добавяме критични тестове върху `download-document` и quota логиката |
| B10 | Database backups | Включваме PITR в Cloud → Settings (Pro instance) |
| B11 | Архивиране на изтрити контрагенти | `contacts` няма soft-delete — счупва връзката към `saved_documents` |
| B12 | Подписът като base64 в `profiles` | За мащаб → Storage bucket `signatures/` с RLS |

## C. План за превръщане в масов продукт за БГ пазар

### Фаза 1 — Готовност за стартиране (4–6 седмици)
1. Затваряме A1–A8 + B1, B5, B10.
2. Юридически due diligence — преглед на 5–10 топ договора от лицензиран адвокат (партньорство).
3. Брандиране: лого, ил-pack, 5 hero видеа „как работи".
4. Бета програма: 50 покани към счетоводители, юристи, малки фирми (без заплащане за 30 дни в замяна на feedback).

### Фаза 2 — Ранен ръст (месеци 2–4)
1. **SEO съдържание**: 80–120 статии тип „Как се прави договор за…" + чекъри по подсектор. Targeting на дълги опашки като „договор за наем апартамент София примерен", където Google показва PDF-ове от 2010 г.
2. **Партньорства**: Българска счетоводна камара, BESCO, Endeavor BG, Capital, Economic.bg — guest articles + B2B reseller код с 20% комисион.
3. **Локални плащания**: добавяме **Borica** + **ePay** + **банков превод** за фирми (Stripe не е масов в БГ за B2B).
4. **Влияние от автори**: 10 правни youtuber-и/podcast-ери с affiliate линкове.
5. **Pricing експеримент**: годишен абонамент 99€ → A/B с „59€ първа година" за активиране.

### Фаза 3 — Мащабиране (месеци 5–9)
1. **B2B Pro+** план (49€/мес): неограничени потребители в едно ателие, споделени контрагенти, e-подпис през КЕП (B-Trust / Evrotrust API), интеграция с MyPos/Microinvest за автоматично попълване от вече съществуващи фирмени данни.
2. **API за интеграция** с CRM/ERP (Microinvest, Plus Minus) — пакети по 200 договора.
3. **White-label за адвокатски кантори**: dogovori.net engine под техния домейн, 199€/мес/кантора.
4. **Mobile app (PWA първа стъпка)** — wizard на телефон, push при подписване.
5. **AI асистент за рисков one-pager** при качване на чужд договор (PDF upload → анализ) — нова primary value prop.

### Фаза 4 — Регионална експанзия (месец 10+)
- Същият engine с RO/GR/HR съдържание (същата правна семейство — civil law).
- Партньор-юрист във всяка нова държава за легализация на шаблоните.

## D. Технически детайли (за разработката)

```text
Приоритет 0 (преди публикация):
  - Legal pages route group + Footer links + signup checkbox
  - rate-limit middleware за generate-contract (cf turnstile + IP table)
  - Stripe automatic_tax + tax_id_collection
  - SEO: lang="bg", canonical, sitemap.xml, robots.txt, JSON-LD Organization+Product, react-helmet-async
  - configure_auth: HIBP on, email confirm on, BG email templates
  - CORS allowlist (constant в _shared/cors.ts)

Приоритет 1 (първи месец след):
  - resolveOrCreateCustomer в create-checkout
  - localStorage за wizard персистенция
  - изтриване на save-document функцията
  - watermark на free PDF
  - soft-delete за contacts (deleted_at column + filter)

Нови таблици:
  - ai_usage(user_id, ip_hash, created_at) — за rate limiting
  - audit_log(user_id, action, target_id, created_at) — съответствие
  - shared_links(doc_id, token, expires_at, viewed_at) — Фаза 2 фича
```

## E. Резюме

Платформата е **функционално готова** на 85% за официално пускане. **Критични блокери** са юридическите страници, ДДС/фактуриране, защитата на AI функцията и SEO базата — те трябва да се закрият преди „масов" пуск, иначе или ще има правни проблеми, или ще се източат AI кредитите за един уикенд.

След закриване на блокерите имаме реален шанс за **доминация на ниша** в БГ — конкуренция почти няма, а target market (МСП + физически лица) е 400 000+ потенциални платци.
