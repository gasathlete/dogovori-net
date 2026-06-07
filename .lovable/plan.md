## Дигитален карусел „Какво може платформата"

High-end 3D coverflow секция веднага след Hero блока на началната страница, която представя 4 ключови предимства на Dogovori.net по визуално впечатляващ начин.

### Място
- Нов компонент `src/components/PlatformShowcase.tsx`
- Монтира се в `src/pages/Index.tsx` веднага след `<Hero />` и преди `<FeaturedBlanks />` (lazy-loaded + Reveal, както останалите секции)
- Запазваме Process / TopDocuments / FeaturedBlanks непокътнати

### Съдържание (4 карти)

1. **Решения за ежедневния бизнес**
   - Иконка: Briefcase / Building
   - Подзаглавие: „Договори, протоколи и заявления, готови за подпис за минути"
   - Mini-визуал: стилизиран mock на договор с подчертани полета
2. **Качествено съдържание — бързо и удобно**
   - Иконка: Sparkles / Wand
   - Подзаглавие: „AI-асистент, auto-корекции и интелигентни клаузи. Без правен жаргон без причина."
   - Mini-визуал: текст с „светещи" корекции (gold highlight линии)
3. **Дигитален каталог правна документация**
   - Иконка: Library / BookOpen
   - Подзаглавие: „600+ образци по сектори — от наем и труд до NDA, GDPR и пълномощни"
   - Mini-визуал: stack от мини-карти с категории
4. **Съхранение, подреждане и контрагенти**
   - Иконка: FolderTree / Users
   - Подзаглавие: „Папки, споделяне и прилагане към контрагенти на едно място"
   - Mini-визуал: контрагент-аватари + папка

### Дизайн (3D Coverflow)

```text
        [card -2]   [card -1]   [ ACTIVE ]   [card +1]   [card +2]
         dim 40%    dim 70%      100% scale   dim 70%     dim 40%
         rotateY    rotateY      front        rotateY     rotateY
         +35°       +18°                      -18°        -35°
```

- Контейнер `perspective: 1600px`, всяка карта `transform-style: preserve-3d`
- Активна карта: 420×520px, scale 1, лек float (translateY hover), gold border-glow (shadow-elegant + ring-gold/30)
- Странични карти: scale 0.78 / 0.6, opacity 0.55 / 0.25, rotateY ±18° / ±35°, translateX за припокриване
- Преходи: `transition: transform 700ms cubic-bezier(.22,1,.36,1), opacity 500ms`
- Auto-rotate на 7s (pause on hover / focus / touch — както BlogRotator)
- Навигация: ← → стрелки (lucide ChevronLeft/Right в кръгли бутони с hairline border), точки долу, клик върху странична карта = центрира я
- Drag / swipe на touch и мишка (reuse touch логиката от BlogRotator, threshold 60px)
- Keyboard: ArrowLeft / ArrowRight когато секцията е в focus
- Reduced motion: премахва rotateY, оставя fade + scale; auto-rotate спира

### Визуални акценти (motion level 4)

- Background: navy с suptle radial gold gradient под активната карта (`bg-[radial-gradient(60%_50%_at_50%_60%,hsl(var(--gold)/.08),transparent)]`)
- Corner ornaments (gold/40, 3px) на активната карта — консистентно с BlogRotator
- Kicker chip „Платформата" в gold uppercase tracking
- H2 секция: `Всичко за вашите договори — в едно работно пространство`
- Mini-визуалите вътре в картата с лек parallax (translateY -8px при hover), border-beam-like тънка линия в долния ръб (CSS-only animated gradient)
- Анимирана progress линия под точките (както BlogRotator), синхронизирана с 7s ротация

### Технически детайли

- React + Tailwind, само existing tokens (`gold`, `navy`, `hairline`, `card`, `shadow-elegant`, `font-serif`)
- Lucide icons (вече налични)
- Lazy import в `Index.tsx`: `const PlatformShowcase = lazy(() => import("@/components/PlatformShowcase").then(m => ({ default: m.PlatformShowcase })))`
- Обвиване с `<LazyOnVisible minHeight={560}>` + `<Reveal>`
- Без нови dependencies (без Three.js — CSS 3D transforms са достатъчни за coverflow и пазят bundle)
- SEO: семантичен `<section aria-labelledby="platform-showcase-heading">` с H2
- a11y: aria-live="polite" за активното заглавие, focus ring върху бутони и карти, `prefers-reduced-motion` бранч

### Файлове

- **Нов**: `src/components/PlatformShowcase.tsx`
- **Промени**: `src/pages/Index.tsx` (добавя секцията след Hero)

### Извън скоупа

- Не пипаме Hero, Process, FeaturedBlanks, TopDocuments
- Не добавяме нови маршрути или backend
- Не променяме съществуващи компоненти или дизайн система