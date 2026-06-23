## Визуална/UX оптимизация — dogovori.net

Анализ на /index и /plans на desktop (1280) и mobile (393). Само frontend/CSS, без бизнес логика, цени или текстове извън посочените.

### Установени проблеми

1. **Hero mobile** — decorative scales icon + 4 eyebrow chips (3 реда) изтласкват CTA под сгъвката на 393×618.
2. **Hero italic accent** — обхваща цяла фраза („търсят и намират"), губи смисъла на акцента.
3. **Hero bullets mobile** — 6 еднакви карти в колона, няма йерархия и видим click affordance.
4. **Header CTA** — плътен gold „Влезте" конкурира hero primary „Започни безплатно".
5. **Pricing 4-в-ред** — заглавия се чупят („Професионалис|т"), Безплатен се състезава с платени, „PREMIUM" badge на Предприемач, но Екип (109€) визуално доминира.
6. **Yearly savings** — „−17%" малък/сив, не продава.
7. **Cookie banner** — заема ~25% от mobile viewport, 3 еднакво тежки бутона.
8. **Trust row** — 5 черни квадрата, Ivanov & Milev дублирано → изглежда placeholder, подкопава доверието.
9. **Footer line** — три оферти в едно изречение („без карта · 12.90 €/мес · промокод FIRST100 −30%") разсейва.
10. **Font FOUT** — Instrument Serif идва late без preload.
11. **Theme toggle** — без етикет до login, малка affordance.

### План за изпълнение (P0 → P1, едно подаване)

**P0 — премахва триения**
- `src/components/Hero.tsx`
  - Скрит scales icon на `<md`.
  - Eyebrow chips → 1-ред horizontal scroll-x на mobile (no wrap).
  - Italic accent ограничен до 1 дума.
  - Bullets: 2×3 grid на mobile (вместо 6×1), винаги видим chevron + тънка underline at-rest за affordance. 7-те destination URLs запазени както е по памет.
- `src/components/Header.tsx`
  - „Влезте" → outline/ghost variant.
  - Gold primary CTA „Започни безплатно" се появява в nav-а sticky след scroll past hero (useScrolled hook вече съществува).
- `src/pages/Plans.tsx`
  - 3 платени плана в равен grid; Безплатен изваден като slim full-width карта отдолу.
  - Featured (Предприемач): translate-y -8px, gold border 2px, по-силна елевация (shadow-elegant).
  - Цена: serif число + suffix отдолу (не отдясно), запазвайки canonical 12.90/19.90/109.
  - Yearly toggle savings badge: success color, „Спести 17%".
- `src/components/CookieBanner.tsx`
  - Компактен 56px bottom bar на mobile; „Приемам всички" primary, „Само необходими" + „Настройки" като link-style.

**P1 — polish**
- `src/components/PartnersBoard.tsx` (или съответстващия trust strip) — премахване на дублирани лога; ако реални лога липсват, замяна с numeric proof: „500+ потребителя · 12 000+ изготвени документа · 4.8★".
- `src/components/Footer.tsx` — премества ThemeToggle тук; offer line свежда до 1 (промокода).
- `src/components/Header.tsx` — ThemeToggle премахнат от nav-а на mobile.
- `index.html` — `<link rel="preload" as="font">` за Instrument Serif + `font-display: swap` в `src/fonts.ts`.
- Persistent ⌘K floating trigger долу-вдясно на desktop (CommandPalette вече съществува) — само на ≥md.

### Извън обхват
- Бизнес логика, цени, ops квоти, Stripe.
- Assistant / Console / Dashboard.
- Промяна на палитра или font pair.
- Текстове извън hero H1, cookie banner и footer offer line.

### Файлове
- `src/components/Hero.tsx`
- `src/components/Header.tsx`
- `src/pages/Plans.tsx`
- `src/components/CookieBanner.tsx`
- `src/components/PartnersBoard.tsx` (или SocialProofStrip.tsx — ще проверя кое се рендерира)
- `src/components/Footer.tsx`
- `index.html`
- `src/fonts.ts`
- `src/index.css` — само ако трябва success badge token

### Verification
- Playwright screenshots /index + /plans на 393×800 и 1280×900 преди/след.
- Проверка че 7-те hero bullets водят до: /catalog, /assistant, /catalog, /console/analysis, /wizard-bilingual, /console/signing, /kits.
- Build pass.