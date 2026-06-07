## Цел

1. Нова **публична** страница `/plans` — модерна landing-style със сравнение на плановете. Нерегистрираните потребители я виждат без login wall.
2. CTA „Вижте плановете" от PlatformShowcase → води към `/plans` (вместо `/account#plans`).
3. Smart CTA в plan cards: ако не е логнат → регистрация → после checkout за избрания план.
4. **Запазване в паметта**: имена на плановете в BG UI — **„Предприемач"** (Pro) и **„Екип"** (Team).

## Промени

### 1. Memory update (при влизане в build mode)
Създавам `.lovable/memory/plan-names.md` + добавям ред в `.lovable/memory/index.md` под Core:

> Plan display names (BG UI): Free → „Безплатен", Pro → **„Предприемач"**, Team → **„Екип"**. Използват се навсякъде — pricing, account, ProUpgradeDialog, CTA копи, Stripe product display names, имейли. Не показваме „Pro"/„Team" в UI копи.

### 2. Нова страница `src/pages/Plans.tsx` (публична)

- **Hero**: „Изберете плана, който работи за вас" + златен FIRST100 банер (30% месечен / 40% годишен).
- **Billing toggle**: Месечно ↔ Годишно, „спести ~17%" значка.
- **3 plan cards** (bento grid, glass-morphism, hairline gold borders):
  - **Безплатен** — 5 операции при регистрация + 2/мес, AI 5 съобщ./мес, 1 комплект. CTA „Започни безплатно".
  - **Предприемач** (highlighted, gold `border-beam`, „Най-популярен" badge): 12.90 €/мес или 129 €/год. 100 операции, неограничен AI, двуезични, неогр. комплекти, без воден знак, loyalty 5–15%. CTA „Активирай Предприемач".
  - **Екип**: 10.90 €/seat/мес (мин. 3 = 32.70 €/мес) или 109 €/seat/год. Споделени документи, audit log, екипно фактуриране. CTA „Създай екип".
- **Feature comparison** — collapsible `ExpandableCard` „Виж пълно сравнение ↓": операции, AI, езици, комплекти, поддръжка, loyalty, воден знак, audit log.
- **FAQ accordion** (5–6 въпр.: какво е операция, смяна на план, ДДС, отказ, годишно vs месечно, екип).
- **Trust strip** (ЗЗД/GDPR/ТЗ badges).
- **Final CTA band**: ако не е логнат → „Регистрирай се за 30 секунди"; ако е логнат → „Активирай Предприемач сега".

### 3. Smart CTA логика (във всяка plan card)

```ts
const { user } = useAuth();
const target = `/account?tab=subscription&plan=${plan}&promo=FIRST100`;
const href = user
  ? target
  : `/auth?redirect=${encodeURIComponent(target)}&intent=plan_${plan}`;
```

След регистрация потребителят се връща директно в checkout flow за избрания план (Auth страницата вече чете `redirect` от sessionStorage).

### 4. Routing

В `src/App.tsx`:
```
<Route path="/plans" element={<Plans />} />
```
Lazy-loaded като останалите. SEO: `<Seo>` с title „Планове и цени — Dogovori.net" + JSON-LD `Product`/`Offer`. Запис в `public/sitemap-static.xml`.

### 5. Пренасочване на CTA „Вижте плановете"

`src/components/PlatformShowcase.tsx` ред 631:
```
to="/account#plans"  →  to="/plans"
```

### 6. Преименуване Pro/Team → Предприемач/Екип

Само user-facing копи. Кодови ключове (`plan: "pro"`, Stripe lookup_keys) **остават непокътнати**. Засегнати файлове за UI копи:
- `src/components/ProUpgradeDialog.tsx` — „Pro план" → „Предприемач", бутони „Pro — 9.90 € / месец" → „Предприемач — 12.90 €/мес"; ъпдейтнати и към актуалното ценообразуване.
- `src/components/ProValueCard.tsx`, `src/components/FreeOpsChip.tsx`, `src/pages/Account.tsx` (subscription tab labels), `src/components/wizard/RiskReport.tsx`, `src/components/CTABand.tsx` ако реферира „Pro".
- `src/i18n/locales/bg/*.json` (ако има plan labels) — преименуване.
- НЕ пипам: `useIsPro.tsx`, `plan === "pro"` логиката, Stripe ID, types.

### 7. Дизайн език

- Тъмен navy gradient + suptle gold sweep (`gold-sweep-bg`).
- Plan cards: backdrop-blur, hairline gold border, hover lift + magnetic.
- Pro card: rotating conic-gradient `border-beam`.
- Stagger reveal scroll-in, count-up за брояч „Над X документа подписани днес".
- Mobile-first: stack cards, sticky billing toggle при scroll.
- Reduced-motion respect.

## Технически детайли

- **Нови файлове**: `src/pages/Plans.tsx`, `src/lib/plansData.ts` (центриран източник за features + cena), `.lovable/memory/plan-names.md`.
- **Промени**: `src/App.tsx`, `src/components/PlatformShowcase.tsx`, `.lovable/memory/index.md`, `src/components/ProUpgradeDialog.tsx`, и UI копи в горепосочените файлове.
- **Без backend, без нови dependencies**. Използва съществуващи: `ExpandableCard`, `Accordion`, `Tooltip`, `Seo`, `useAuth`, `useIsPro`, `Button`, design tokens.
- Pricing източник: Pro 12.90/129 €, Team 10.90/109 € (от memory), one-off 2.90 €.

## Извън скоупа

- Не променям Stripe price IDs или backend логика.
- Не пипам `plan === "pro"` checks или `useIsPro`.
- Не пипам i18n EN копи (само BG в този ход).
- Не добавям нови планове.
