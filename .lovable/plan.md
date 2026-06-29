
# Разширен 4-стъпков монетизационен фънъл за Договори.нет

Втора, по-агресивна версия. Запазваме 4-те стъпки, но добавяме психологически крючета, segmentation по intent и pre-login/post-login разклоняване — защото CTA преди вход е винаги „Започни безплатно", а след вход се персонализира спрямо плана и историята.

## Pre-login vs Post-login CTA матрица (нова, критична част)

Това трябва да е глобално правило в целия фънъл — компонент `<PrimaryCTA />`, който избира текста сам:

| Стъпка | Pre-login (анонимен) | Post-login Free | Post-login Платен |
|---|---|---|---|
| 1. Landing | **„Започни безплатно"** → стъпка 2 | „Към моите документи" → /account | „Изготви нов документ" → /build |
| 2. Educate | **„Започни безплатно"** → стъпка 3 | „Анализирай документ" → /analiz | „Анализирай документ" → /analiz |
| 3. Analyze | **„Започни безплатно"** (отключва пълен анализ след регистрация) | „Виж пълния анализ" (изхабява 1 op) | „Виж пълния анализ" (без op ако в план) |
| 4. Convert | **„Започни безплатно"** → signup + reverse-trial | „Активирай Предприемач 7 дни безплатно" | „Добави Top-up" / „Покани екип" |

Технически: hook `useFunnelCta(step)` връща `{ label, href, variant }` и се рендерира от един shared компонент. Това решава и проблема с дублирани „Качи / Изготви" бутони сега.

## Разширения по стъпка

### Стъпка 1 — LANDING (TOFU) — „1 въпрос, 1 CTA"
Сегашният Hero пита и показва твърде много. Превръщаме го в **conversational hero**:

- Над Hero: 1 input field — „Какъв документ ти трябва?" (autocomplete от templateIndex).
- Под input: **„Започни безплатно"** (единственият primary CTA преди вход).
- Под CTA: 3 chip-а с топ сценарии (Наем / Трудов / NDA) → pre-fill-ват input-а.
- 2-ри ред: LiveCounter („8 420+ документа") + 5 партньорски лога.
- Скриваме всичко друго в нова секция „Защо Договори.нет?" с „Виж повече ↓".
- A/B вариант: hero с **emoji-driven** сценарии вместо текст (по-висок CTR при mobile-first audience).

KPI: 25%+ от посетителите въвеждат текст или цъкат chip → автоматично качествени leads, не bounce.

### Стъпка 2 — EDUCATE (MOFU) — „Защо да ни вярваш"
`/kak-rabotim` или динамичен слой на лендинга, ако не искаме нов route.

Допълнения към оригиналния план:
- **Interactive ROI calculator**: „Колко харчиш за адвокат?" → slider → „Спести 87% с Предприемач". Дава ангажираност (avg 40 сек time-on-page).
- **Trust accelerator block**: GDPR badge, EU hosting, AI Act compliance, „използван от 320+ компании" (auto-pull от твоите partner_logos).
- **Lead magnet — gated content**: 3 различни PDF според избора в стъпка 1:
  - Наем → „Контролен лист за наемодател 2026"
  - Трудов → „12 капана в трудовия договор"
  - NDA → „Как да защитиш know-how"
- **Comparison table** остава, но preselected колоната на Договори.нет с goldSweep анимация.
- Mid-page **„Започни безплатно"** sticky bar появяващ се след 50% scroll.

### Стъпка 3 — ANALYZE (BOFU) — „Aha момент с blur paywall"
Това е машината за конверсия. По-детайлно:

```text
┌─────────────────────────────────────────────────┐
│  Upload PDF / Paste text / Answer 3 questions   │
│  ─────────────────────────────────────────────  │
│  [██████████░░░░░░░░░░] 50% — анализираме...    │
│  ─────────────────────────────────────────────  │
│  ✅ РИСК 1 (free): Липсва клауза за неустойка   │
│  🔒 РИСК 2: ████████████ (blur)                 │
│  🔒 РИСК 3: ████████████ (blur)                 │
│  🔒 + Още 4 риска и AI препоръки                │
│                                                  │
│  [ Започни безплатно — виж всички рискове ]     │
│  💡 Запазваме този анализ за 24 часа            │
└─────────────────────────────────────────────────┘
```

- **3 entry mode-а**: Upload / Paste / Interview (3 въпроса). Различни conversion rates — мерим и оптимизираме.
- **Real-time progress** с фалшиво забавяне (1.8s) — изследванията показват по-висока percieved value vs. instant.
- **Blur reveal** на премиум рисковете с „lock" иконка и hover tooltip „Регистрирай се безплатно за да отключиш".
- **Session save**: `analysis_sessions` таблица с 24h TTL — линк-обратно с magic link в имейл.
- **Risk score badge** (0–100) — gamification елемент, който хората искат да подобрят.
- **Social proof inline**: „По-добре от 73% от анализираните договори в твоята категория".
- Pre-login CTA: **„Започни безплатно — виж всички рискове"**.
- Post-login Free CTA: „Изхарчи 1 операция за пълен анализ" (с counter „остават X безплатни").

### Стъпка 4 — CONVERT (Decision) — „Reverse trial + decision aid"
`/plans` се превръща от ценоразпис в **решение-машина**:

- **Personalized hero**: „Препоръчваме ти Предприемач — открихме 5 риска във вашия договор" (чете от analysis_session).
- **Reverse-trial banner** (само за стигнали от стъпка 3): „7 дни Предприемач безплатно. Без карта. Откажи с 1 клик."
- **Decision matrix** (3 колони — Безплатен / Професионалист / Предприемач) с pre-highlighted препоръчан план.
- **Anchoring**: Показваме „средна цена адвокат: 290€/договор" над цените.
- **Urgency** (етично): „Резултатът от твоя анализ изтича след 23:47:12" (true countdown до session TTL).
- **Risk reversal**: „30-дневна гаранция за връщане на парите" + „Откажи по всяко време".
- **Social proof at price-point**: До всеки план — „127 предприемачи избраха този план този месец".
- **Sticky exit-intent**: при опит за затваряне → „Изчакай! 50% отстъпка на първия месец" (един път на сесия, само за стигнали до /plans).

## Cross-funnel разширения (отвъд оригиналния план)

1. **Funnel Step Header** — мини progress bar (4 точки) горе на стъпки 2/3/4, видим само в активен funnel session. Психологически: „остава 1 стъпка".
2. **Smart routing след signup**: ако потребителят е дошъл от стъпка 3 → връщаме го в `/analiz?session=...` веднага след регистрация (не на dashboard) — той вижда отключения резултат **моментално**. Това е dopamine hit-ът, който затваря loop-а.
3. **Email капачка по drop-off**:
   - Drop в стъпка 2 → 1 email след 24h с lead magnet
   - Drop в стъпка 3 → 3 emails (1h, 24h, 72h) с „твоят анализ те чака"
   - Drop в стъпка 4 → 2 emails с casestudy + 50% оферта
4. **Retargeting pixels**: Facebook/Google/LinkedIn audience-и по `funnel_step` event. Различен ad creative за всеки сегмент.
5. **DogovAI bubble — funnel aware AI**:
   - Стъпка 1: „Кажи ми с 1 изречение какво искаш"
   - Стъпка 2: „Имаш ли въпрос за нашите гаранции?"
   - Стъпка 3: „Да обясня ли рисковете на човешки език?"
   - Стъпка 4: „Кой план ти отива? Питай ме."
6. **Referral loop**: след първа конверсия → „Дай 5€ кредит на приятел, получи 5€" — viral мултипликатор.
7. **Streak & gamification** (вече имаме `useEngagement`): закачаме streaks към funnel events, не само към ops — „Ти си в Top 10% активни предприемачи!".
8. **Anti-friction signup**: Magic link като default (не парола). Google OAuth като 1-click. Без email confirmation за стъпка 3 → 4 преход (deferred verification).

## Метрики и измерване (Admin Analytics extension)

Добавяме нов dashboard `/admin/funnel`:
- Funnel chart с 4 стъпки + drop-off % между всяка двойка.
- Cohort table: leads-by-month → activation → paid.
- Segmentation: device / source / entry CTA / lead magnet downloaded.
- A/B test framework: `<ExperimentSwitch experimentId="hero_v2">` компонент, чете flag от `experiments` таблица.

## Очакван ефект (агресивна цел за Q4 2026)

| Метрика | Сега | Конс. цел | Stretch цел |
|---|---|---|---|
| Landing CTR към стъпка 2 | 8% | 22% | 32% |
| Стъпка 2 → 3 | n/a | 40% | 55% |
| Стъпка 3 → signup | n/a | 30% | 45% |
| Signup → платен (30d) | ~2% | 8% | 14% |
| Email leads/мес | 0 | 600 | 1500 |
| LTV / CAC | unknown | 3:1 | 5:1 |

## Технически roadmap

**Фаза А — Foundation (1–2 дни)**
- `useFunnelCta(step)` hook + `<PrimaryCTA>` shared компонент.
- `funnel_events` таблица + tracking helper в `analytics.ts`.
- Свиване на `Index.tsx` до conversational hero + 2 секции.
- Lead magnet endpoint `subscribe-lead` edge function + `leads` таблица с RLS.

**Фаза Б — Analyze step (2–3 дни)**
- Нов route `/analiz` с 3 entry mode-а.
- `analysis_sessions` таблица (24h TTL, sweeper в notify-due-reminders cron).
- Blur paywall UI компонент + `<RiskScoreBadge>`.
- Magic-link-back механизъм за email recovery.

**Фаза В — Convert step (1–2 дни)**
- `/plans` чете analysis_session → personalized hero + recommended plan.
- Reverse-trial flow (Stripe trial without card → grant 7 дни Предприемач).
- Exit-intent компонент + countdown timer.

**Фаза Г — Educate + Lead magnets (1 ден)**
- `/kak-rabotim` route с ROI calculator + 3 lead magnet PDFs (генерирани).
- Sticky scroll CTA.

**Фаза Д — Growth loops (1–2 дни)**
- Email drip автоматизация (Resend templates вече ги имаме).
- Retargeting pixels + funnel_step dataLayer push.
- Admin `/admin/funnel` dashboard.
- DogovAI funnel-awareness contextual prompts.
- Referral system MVP.

Общо: ~8–10 работни дни за пълна имплементация. Може да тръгне на вълни (А → Б → В носят 80% от ефекта).

## Решения, които искам да потвърдиш

1. **Reverse-trial 7 дни Предприемач без карта** — ОК или предпочиташ „с карта, безплатно ако откажеш"? (без карта = по-висок signup rate, по-нисък conversion-to-paid)
2. **Премахваме ли Pricing от главното меню?** Препоръчвам да остане, но като второстепенен link — primary е CTA-то.
3. **Exit-intent 50% оферта** — ОК ли е етично за теб или го заменям с lead magnet?
4. **Lead magnet PDF-и** — генерирам ли ги аз с текущия AI, или ще ги дадеш ти?
5. **Magic link като default signup** (вместо парола) — ОК?
