
# Mobile-First оптимизация

Цел: приложението да усеща "приложение в ръка" — всичко важно достъпно с палец, без хоризонтално скролване, без забавяне, с ясни 44×44 px touch таргети и спазена safe-area на iOS/Android.

## 1. Глобална мобилна рамка

- **Bottom tab bar** (само под `lg`): фиксирана навигация с 5 икони — Начало, Каталог, Асистент, Конзола, Профил. Скрита автоматично при скрол надолу, появява се при скрол нагоре. Уважава `env(safe-area-inset-bottom)`.
- **Header опростяване на мобилно**: само Лого (вляво) + бърз бутон "Започни" (вдясно). Хамбургерът се сваля — навигацията се поема от bottom bar; останалите линкове (Цени, Помощ, Език) минават в drawer от долу нагоре (sheet).
- **Safe-area + viewport**: добавяме `viewport-fit=cover` в `index.html`, помощни класове `pb-safe`, `pt-safe`, `px-safe` в `tailwind.config`/`index.css` за всички фиксирани/sticky елементи.
- **Touch таргети ≥ 44px**: глобален аудит на `h-8`/`h-9` бутоните в `Header`, `Hero`, `Catalog` филтри, `Wizard` контроли — минимална височина `h-11` на мобилно.
- **No horizontal scroll**: добавяме `overflow-x: clip` на `body`; проверка на `min-w-[200px]` филтри в Catalog → стават `w-full` на мобилно.

## 2. Hero (`/`) — мобилен компресиран изглед

- Свиване на vertical padding под `sm`: pt-2 pb-6, без `min-h-[100svh]`.
- Заглавието `text-2xl` → `text-xl` под 380px; ред-висота 1.1.
- Шапка-категории (ЗЗД/ТЗ/ЗУТ … е-Подпис) → 2 реда по 4 чипа, всеки чип ≥ 32px tap.
- 7-те clickable bullet-а: на мобилно 1 колона, всеки като пълноширок ред с икона + стрелка вдясно (списък в стил iOS).
- Primary CTA "Започни" — sticky в долната част на Hero на мобилно, винаги видим без скрол.
- Скриваме decorative абсолютно позиционирани икони/quote (`md:block`) под `sm` — намалява визуален шум.

## 3. Catalog (`/catalog`) — mobile UX

- Филтрите → bottom sheet ("Филтри" бутон отваря пълноекранен sheet с категории/тагове + "Прилагай"). Премахваме широките desktop chips ред.
- Резултатите: 1 колона на мобилно, плътни карти с икона + заглавие + чип "категория" + favorite звезда (44px). Без hover ефекти на touch.
- Sticky search bar отгоре (под Header), `inputmode="search"`, auto-clear бутон.
- Lazy/infinite scroll вместо пагинация (виртуализация остава пропусната — потвърдено в предишен спринт).

## 4. Wizard (`/wizard/*`) — mobile flow

- **Sticky progress bar** отгоре (стъпка X от Y, % напредък).
- **Sticky action bar** долу: "Назад" / "Напред" (или "Запази", "Подпиши") — винаги достъпни с палец, safe-area aware.
- Формите: 1 колона, `inputmode` и `autocomplete` атрибути (`tel`, `email`, `numeric`, `postal-code`, `bday`).
- Дълги select-и → нативен `<select>` или bottom sheet с търсене.
- Preview на договора: collapse-нат по подразбиране на мобилно с "Виж преглед" бутон, който отваря fullscreen overlay.

## 5. Console (`/console/*`) и акаунт

- Tab listовете (`ScrollableTabsList`, `Console`, акаунт) → segmented control с horizontal snap-scroll, активен таб винаги в изглед, по-голям шрифт.
- Карти за документи: swipe actions (изтрий/преименувай) през `react-swipeable` (вече реален touch UX без menu бутон).
- Таблици в админ остават desktop-only с readable-only mode на мобилно (карти вместо таблица за основните полета).

## 6. Performance дребни мобилни оптимизации

- `<meta name="theme-color">` различен за светла/тъмна тема (mobile address bar).
- Премахваме hover-only анимации на `(hover: none)` чрез media query (по-малко jank на iOS Safari).
- Дебоунс на скрол слушателите за bottom-bar autohide (`requestAnimationFrame`).
- `touch-action: manipulation` на всички бутони/линкове (премахва 300ms tap delay в edge cases).

## 7. Файлове за докосване

Нови:
- `src/components/MobileBottomNav.tsx`
- `src/components/MobileMoreSheet.tsx` (Цени, Език, Тема, Помощ, Изход)
- `src/components/StickyMobileCTA.tsx`
- `src/hooks/useHideOnScroll.ts`
- `src/hooks/useSafeArea.ts`

Промени:
- `index.html` — `viewport-fit=cover`, динамичен `theme-color`.
- `tailwind.config.ts` + `src/index.css` — safe-area utilities, `@media (hover: none)` правила, `overflow-x: clip`.
- `src/App.tsx` — монтиране на `<MobileBottomNav />`, padding-bottom на main за избягване припокриване.
- `src/components/Header.tsx` — мобилно компактен вариант.
- `src/components/Hero.tsx` — мобилна композиция, sticky CTA, чипове в 2 реда.
- `src/pages/Catalog.tsx` — bottom sheet филтри, 1-колонен списък, sticky search.
- `src/pages/Wizard.tsx` — sticky progress + sticky action bar, нативни inputmode-и.
- `src/pages/Console.tsx` + `account/ScrollableTabsList.tsx` — segmented snap tabs.

## 8. Изключени от този план (нужно потвърждение)

- Capacitor/native shell — оставаме на web (PWA-готовност вече има manifest).
- Промени на бизнес логика/цени/feature flags.
- Виртуализация на дълги списъци (отложена).
- Админ страници не получават bottom nav — те си остават desktop-first.

## Технически бележки

- Bottom bar показва се само при `useMediaQuery('(max-width: 1023px)')` И `!route.startsWith('/admin')`.
- Hide-on-scroll: следим `window.scrollY` delta > 8px с rAF throttle; връщаме на scroll-up или при достигане до < 80px от върха.
- Safe-area utilities:  
  `.pb-safe { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }`  
  `.h-bottom-nav { height: calc(56px + env(safe-area-inset-bottom)); }`
- Tap target audit script: `rg "h-(6|7|8|9) " src` → ръчно решение per компонент.

```text
┌─────────────────────────────┐
│  Header (lого + Започни)   │  ← компактен
├─────────────────────────────┤
│                             │
│        Контент              │
│   (1 кол., sticky search)   │
│                             │
├─────────────────────────────┤
│ 🏠  📚  🤖  🗂  👤          │  ← bottom nav (safe-area)
└─────────────────────────────┘
```
