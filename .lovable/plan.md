## Цел

Едно източник на истина за плановете в целия сайт (Plans.tsx вече е правилен):

- **Безплатен** — 5 операции при регистрация + 2/мес.
- **Предприемач** — **12.90 €/мес.**, 100 операции/мес.
- **Екип** — **10.90 €/seat/мес.** (мин. 3 места = 32.70 €/мес.)
- Еднократен пакет — 1.90 € за 5 операции (запазва се)

Всички стари "Pro 9.90" / "Team 7.90" / "23.70" изчезват от UI, JSON-LD, FAQ и meta.

## 1. Замени стари цени/имена (Pro→Предприемач, Team→Екип, 9.90→12.90, 7.90→10.90, 23.70→32.70)

| Файл | Какво се променя |
|---|---|
| `src/components/Hero.tsx:192` | "Pro 9.90 €/мес." → "Предприемач 12.90 €/мес." |
| `src/components/CTABand.tsx` | подобен полиш на под-CTA текста (ако реферира план) |
| `src/components/PainSolution.tsx:10` | "9.90 €/мес. за до 100 документа" → "12.90 €/мес. за 100 документа" |
| `src/components/FAQ.tsx:23` | пренапиши отговора с новите имена/цени |
| `src/components/ProUpgradeDialog.tsx:151` | "Pro — 9.90 €" → "Предприемач — 12.90 €" + текстове долу |
| `src/components/ProConversionToast.tsx:37,43` | "Pro дава 100 операции/месец за 9.90 €" → "Предприемач — 100 операции/мес. за 12.90 €" |
| `src/pages/Template.tsx:121` | FAQ отговор → "Предприемач (12.90 €/мес, 100 операции)" |
| `src/lib/seo/schemas.ts:60,109,110` | JSON-LD FAQ + Offers: имена `Предприемач` / `Екип` (per seat), цени 12.90 / 10.90 |
| `src/lib/jsonLd.ts:116-132` | същото — обнови двата Offer-а |

Промокод **FIRST100 → −30%** в Hero ще се запази (12.90 € → ~9.03 €) — само името се сменя на "Предприемач".

## 2. Финален полиш: текст, размери, скорости (mobile 393px + desktop)

### Hero (мобилно)
- H1: `text-2xl sm:text-3xl md:text-5xl lg:text-6xl` → намали мобилния `clamp` с ~10%; намали и `line-height` за по-плътно първо впечатление.
- Sub-CTA текст (под бутона) → намали до `text-[11px]` на мобилно, едноредово.
- "Виж демо ↓" линк → по-малък tap target, същата височина като primary CTA на мобилно.

### Скорости (animations)
- Намали `transition-duration` на `magnetic-hover`, `linear-card hover` и `parallax filigree` от ~600ms на 300ms.
- Уважавай `prefers-reduced-motion: reduce` — изключи parallax и magnetic shift.
- `LazyOnVisible` rootMargin → `200px` за по-бързо visible-ready на бавни мобилни мрежи.

### Размери (consistency)
- Унифицирай секционни paddings: `py-14 sm:py-20 md:py-24` навсякъде (Hero, PainSolution, Comparison, FAQ).
- Card радиуси: `rounded-xl` mobile / `rounded-2xl` desktop — едно правило.
- Comparison table → на мобилно scroll-snap по колоните, sticky лява колона с име на ред.

### Текстови микро-полирания
- Hero H1 → запази, но провери дали "Договори, които…" чупи добре на 393px.
- PainSolution → скъси най-дългите bullet-и (макс. 60 знака за мобилно).
- ComparisonTable → "0,10–1,90 €" → "1,90 € за 5 ops" (по-ясно).

## 3. QA — тест за проблеми

След промените, проверка на:
- Mobile 393×617 (current preview) и Desktop 1440 — визуален sweep на Hero, PainSolution, Comparison, FAQ, CTABand.
- `rg "9\.90|7\.90|23\.70|\bPro 9|Team 7"` → трябва да върне 0 резултата в `src/components`, `src/pages`, `src/lib`.
- Console + Network → 0 грешки.
- JSON-LD валидация: schemas.ts и jsonLd.ts даваат правилни цени.

## 4. Memory update

Обнови `mem://index.md` Core: новата ценова политика:

```
Pricing: Предприемач 12.90 €/mo (100 ops), Екип 10.90 €/seat/mo (min 3 seats = 32.70 €/mo), one-off pack 1.90 € for 5 ops. VAT 20% inclusive.
```

## Файлове за редакция (без нови)

`Hero.tsx`, `CTABand.tsx`, `PainSolution.tsx`, `ComparisonTable.tsx`, `FAQ.tsx`, `ProUpgradeDialog.tsx`, `ProConversionToast.tsx`, `Template.tsx`, `seo/schemas.ts`, `jsonLd.ts`, `index.css` (transition speeds), `mem://index.md`.

Без backend / без миграции / без нови компоненти.