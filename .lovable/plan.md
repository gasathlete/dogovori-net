## Модернизация на началната страница — "Wow" ритъм с progressive disclosure

Целта: запазваме съществуващата йерархия (Hero → PlatformShowcase → FeaturedBlanks → TopDocuments → BlogRotator → Sectors → Process → Partners → Testimonials → Compliance → CTABand), но всяка секция получава модерен пласт — expandable "Виж повече" cards, magnetic hover, scroll-reveal stagger и микро-анимации, които водят естествено към conversion.

### Принципи (приложени навсякъде)

- **Progressive disclosure**: всяка секция показва кратък front-side; пълните детайли са под "Виж повече" / expand-toggle. Намалява cognitive load, повишава scroll engagement.
- **Single visual language**: gold accents, hairline borders, navy surfaces — без нови цветове. Само нови *motion* tokens.
- **Motion budget**: всичко с `prefers-reduced-motion` бранч. Никаква auto-rotation > 8s.
- **Mobile-first**: всеки expandable е tap-friendly (44px target), плавно height-transition.

### Секционни промени

**1. Hero — финален щрих (минимални промени)**
- Запазва се. Добавя се едва доловим parallax на медальона при scroll (translateY 0→-8px), `motion-safe` only.
- Под двата CTA: нов микро-индикатор `↓ Scroll за да видите как работи` с gold pulse — насочва към PlatformShowcase.

**2. PlatformShowcase — без структурни промени**
- Вече беше оптимизиран; запазваме.

**3. FeaturedBlanks (Топ 5 най-търсени бланки) — Expandable Card Pattern**
- Всяка карта получава: front-side (текущото съдържание), back-side под бутон **"Виж детайли ↓"**.
- Expanded съдържание (height auto-animated): кратки буллети — *Кога се ползва*, *Кой подписва*, *Срок*, mini-FAQ (1 въпрос).
- Magnetic hover: картата леко follow-cursor (max 4px translate) на desktop.
- Stagger reveal: всяка карта се появява със 60ms delay при scroll-in.

**4. TopDocuments (Топ 5 най-теглени) — Live counters + expandable**
- Брояч на изтегляния анимира от 0 до `total` при scroll-in (1.2s ease-out). Усещане за "живи данни".
- "Виж още 5" toggle: разкрива position 6-10 със slide-down animation. Без navigation.
- Hover: gold border-beam обикаля картата (CSS conic-gradient mask, 2s loop, only on featured card).

**5. BlogRotator — без структурни промени** (вече има карусел).

**6. SectorGrid — Bento-style hover reveal**
- Текущите икони/тайтли остават. На hover (или tap mobile) карточката се "разтваря" и разкрива 3 примерни документа от сектора като quick-pills с линкове.

**7. Process (Функции) — Vertical timeline + expandable steps**
- Преподреждане от 4+2 grid на vertical **scroll-driven timeline** (gold линия отляво, активната стъпка highlight при scroll position).
- Всяка стъпка collapsed по default; tap/click за expand → пълно описание + screenshot/icon-illustration.
- На desktop: split layout — left side timeline pinned, right side показва съдържанието на активната стъпка (като Apple product page).
- Mobile: класически accordion.

**8. Testimonials — Marquee → Carousel hybrid**
- Auto-scroll marquee при desktop (slow, 60s), pause on hover, "Виж всички отзиви" expand → grid от всички testimonials.

**9. ComplianceSection — Trust badges с tooltip-on-hover**
- Всеки badge (ЗЗД, GDPR, ТЗ, ЗУТ) получава hover-popover с 2 изречения какво означава за потребителя.

**10. CTABand — Final wow**
- Animated gold gradient sweep на background (8s loop, motion-safe).
- Counter: "Над **X** документа изтеглени днес" (real-time от download counts hook), pulse animation.
- Двоен CTA: основен `btn-gold` + secondary `Виж планове`.

### Нови utility класове (в `src/index.css`)

- `.expandable-card` — height-transition wrapper с `data-state="open|closed"`.
- `.magnetic-hover` — CSS-only cursor-follow (използва `transform: translate(var(--mx), var(--my))` set чрез JS на mousemove, throttled).
- `.count-up` — CSS counter анимация tied to IntersectionObserver.
- `.border-beam` — conic-gradient ротиращ border.
- `.scroll-stagger > *` — auto-stagger children при reveal (delays чрез `nth-child`).

### Технически детайли

- Без нови dependencies. Всички анимации са CSS + малки JS hooks (IntersectionObserver, mousemove throttle).
- Нов hook: `src/hooks/useCountUp.ts` — анимира число от 0 до target когато елемент е in-view.
- Нов компонент: `src/components/ui/ExpandableCard.tsx` — generic wrapper за expand/collapse с smooth height transition (използва `grid-template-rows: 0fr → 1fr` трик — без JS measurement).
- Process секцията получава нов sub-component `src/components/ProcessTimeline.tsx` (sticky scroll-driven на desktop).
- Всички motion bracketed с `@media (prefers-reduced-motion: no-preference)`.
- Bundle impact: ~3-5 KB gzipped (само CSS + 2 малки hooks).

### Файлове

- **Нови**: `src/components/ui/ExpandableCard.tsx`, `src/hooks/useCountUp.ts`, `src/components/ProcessTimeline.tsx`
- **Промени**: `src/components/FeaturedBlanks.tsx`, `src/components/TopDocuments.tsx`, `src/components/Process.tsx`, `src/components/Testimonials.tsx`, `src/components/ComplianceSection.tsx`, `src/components/CTABand.tsx`, `src/components/SectorGrid.tsx`, `src/components/Hero.tsx` (минимално — scroll hint), `src/index.css` (нови utility класове)

### Извън скоупа

- Не пипаме PlatformShowcase (вече финализиран), BlogRotator, Header, Footer.
- Не променяме routing, backend, data structures.
- Не добавяме нови секции — само модернизираме съществуващите.

### Очакван ефект

- Wow при първи scroll: PlatformShowcase carousel + signed contract animation (вече има) → live counters на TopDocuments → scroll-driven Process timeline → animated CTABand.
- По-високо engagement: expandable cards задържат потребителя на homepage вместо да го пращат към 5 отделни страници.
- По-висок conversion: всеки expand завършва с soft CTA към `/catalog` или `/build`.
