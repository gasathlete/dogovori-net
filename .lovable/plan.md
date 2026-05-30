## Финални high-end визуални подобрения

Целта: премахваме всичко, което изглежда "template-ish" и добавяме детайли, които правят сайта да изглежда като продукт на €19/мес, а не като MVP. Само frontend/presentation — без логика, без бекенд.

### 1. Hero (above-the-fold)
- По-сдържан, по-кинематографичен fade-in за заглавие/CTA (stagger 60ms), с `prefers-reduced-motion` guard.
- Анимиран gold shimmer върху "търсят и намират" (бавен, веднъж при mount, не loop).
- 3-те trust card-а под CTA — добавяме hover състояние (gold corner ticks се появяват), микро lift `-translate-y-0.5`.
- Фиксираме типография: `text-pretty` на параграфа, `text-balance` на h1, по-стегнат line-height на мобилно.
- Премахваме повтарящия се "tracking-[0.22em]" вариант от бадж — uniform с останалите eyebrow-и.

### 2. Header
- Скролна-state: при scroll > 8px бордерът става по-плътен и фонът става `bg-navy/95` (по-luxe sticky feel).
- Активна навигационна точка с малък gold dot (за текуща секция/route).
- Mobile меню: slide-down с `animate-accordion-down` вместо instant.
- "Powered by IM Development" — преместваме само в footer, header става по-чист (currently 2 пъти присъства).

### 3. Глобална полировка
- **Skeleton loaders** за lazy секциите (TopDocuments, Process, Compliance) — вместо `fallback={null}` слагаме shimmer плейсхолдъри (предотвратява CLS и изглежда премиум).
- **Scroll reveal** observer hook (`useInView`) — секциите fade-in-up при влизане във viewport (само веднъж, с reduced-motion guard).
- **Section dividers**: добавяме `hairline-x` между всички секции на Index — visual rhythm.
- **Focus rings**: текущият `box-shadow` focus е добър, но добавяме `:focus-visible` на всички custom `<button>`-и (Hero CTA-та го нямат експлицитно).
- **Selection color**: вече добра, no-op.

### 4. Buttons & micro-interactions
- `btn-gold` hover — добавяме много фин gold sheen sweep (CSS-only, 800ms, веднъж при hover).
- Всички линкове в navigation/footer — `story-link` underline animation за по-tactile feel.
- Loading state на primary CTA-та (spinner вместо текст при async actions, където има такива).

### 5. Image quality & assets
- Hero logo watermark: завъртаме на `rotate-[-4deg]` за по-малко "stock" усещане + lower opacity `0.08` (по-фин).
- Всички `<img>` без `decoding="async"` → добавяме (perf nit).
- OG image проверка: ако липсва или е default, генерираме нов 1200×630 с лого + slogan.

### 6. Footer
- Добавяме една по-светла gold separator hairline над copyright блока.
- "За доставчика | Общи условия..." → grid с 2 колони на мобилно (currently wrap става грозно при 393px).
- Социални икони (ако има налични профили) — иначе пропускаме.

### 7. Dark mode consistency check
- Проверка че никъде няма hardcoded `text-white`, `bg-black`, `text-gray-XXX` — всички през tokens.
- `text-muted-foreground/50` (low contrast) → `text-muted-foreground` където пада под WCAG AA.

### 8. Page transitions
- React Router page transition: лек `animate-fade-in` (200ms) на `<Outlet>`/route container в App.tsx — спира "blank flash" между страниците.

### 9. 404 / Loading / Empty states
- Бърз преглед на `NotFound.tsx`, login error states, празни catalog резултати — да получат същия премиум tone (eyebrow + serif heading + gold CTA).

### 10. Final QA pass
- Lighthouse score check (mobile + desktop).
- Mobile viewport 360-414px проверка на всички ключови страници.
- Reduced-motion preference тест.
- Tab keyboard navigation през Hero → Sectors → CTA.

---

### Технически детайли

Файлове, които ще се пипат:
- `src/components/Hero.tsx` — анимации, shimmer, hover на trust cards
- `src/components/Header.tsx` — scroll state, active link, mobile slide
- `src/components/Footer.tsx` — separator, mobile grid
- `src/pages/Index.tsx` — skeleton fallbacks, section dividers
- `src/index.css` — нови utilities (`btn-gold` sheen, `section-divider`, reveal animation)
- `src/hooks/useInView.tsx` — нов hook за scroll reveal
- `src/hooks/useScrolled.tsx` — нов hook за header state
- `src/components/skeletons/*.tsx` — 3-4 малки skeleton компонента
- `src/pages/NotFound.tsx` — premium re-style
- `src/App.tsx` — route transition wrapper

Без промени в:
- бекенд / edge functions
- auth flow
- pricing / Stripe
- database

### Извън scope (отделни задачи, ако ги искаш)
- Брандиране на Google OAuth consent screen (вече обсъдено — отделна задача).
- Нов hero illustration / video.
- Локализация (en).

---

Ако одобриш, ще го направя на 2 batch-а: (A) Hero + Header + Footer + tokens, после (B) skeletons + scroll reveal + 404 + route transitions.
