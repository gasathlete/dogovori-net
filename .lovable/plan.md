
# Мобилен workspace — концепция и план

## Диагноза (какво не работи сега)

Текущият `/console` е строго 3‑колонен layout, наследен от desktop:
`ConsoleSidebar (56–224px)` + `ConsoleListColumn (~280px)` + `ConsoleCanvas + TabBar + Footer`.

На 393px:
- И трите колони се стискат едновременно → sidebar показва иконки, а надписите "Табло/Сделки/Документи" се пречупват вертикално буква под буква.
- `ConsoleTabBar` е хоризонтален списък с pill‑ове, който също не се събира и се препокрива с action бутоните вдясно.
- Появява се "завъртете екрана" банер — това е симптом, не решение.
- List column и Canvas се борят за същите ~150px ширина → текст се орязва и презастъпва.

Ключово: на mobile не искаме "миниатюрен desktop". Искаме **един панел наведнъж** с ясен начин за превключване.

## Концепция: 3 swipeable сегмента

Мобилният workspace се превръща в **swipe‑деки** от 3 панела, съответстващи на трите естествени сегмента на работния процес:

```text
 ┌───────────────────────────────────────┐
 │  Header (dogovori.net)                │
 ├───────────────────────────────────────┤
 │                                       │
 │           Активен панел               │
 │        (пълна ширина на екрана)       │
 │                                       │
 │        ← swipe наляво/надясно →       │
 │                                       │
 ├───────────────────────────────────────┤
 │  [ Раздели ] [ Списък ] [ Работа ]    │ ← segmented control
 └───────────────────────────────────────┘
```

Трите сегмента:

1. **Раздели** — вертикален списък на секциите (Табло, Сделки, Документи, Качени, Шаблони, Комплекти, Клиенти, Анализи, Подписи, DogovaryAI). Пълна ширина, иконка + етикет на един ред, tap‑target ≥ 44px. Заменя стиснатия `ConsoleSidebar`.
2. **Списък** — редовете на текущата секция (`ConsoleListColumn` съдържанието), пълна ширина, търсачка отгоре, "Нов" бутон закачен горе вдясно. Tap на ред → автоматично прехвърля към сегмент 3.
3. **Работа** — активният таб (`ConsoleCanvas`). Отгоре — компактен таб‑switcher (виж по‑долу). Празно състояние: "Изберете елемент от Списък".

Навигация между сегменти:
- Хоризонтален swipe (touch gesture) — основен път.
- Segmented control долу — fallback + винаги видим индикатор къде си.
- Автоматичен преход: избор на секция → сегмент 2; избор на ред → сегмент 3.
- Бутон "назад" на устройството / горе вляво стрелка → сегмент назад преди exit.

## Мобилен таб‑switcher (замяна на `ConsoleTabBar`)

Хоризонталните pill табове са проблемни на 393px. Замяна с **compact "tab dock"** в горната лента на сегмент 3:

- Показва **активния таб** като етикет + иконка + брой (`Документи · 4`).
- Tap → отваря bottom‑sheet със списък на всички отворени табове (иконка, заглавие, dirty индикатор, X за затваряне, pin toggle).
- Swipe надолу от tab dock → същият sheet.
- Long‑press на ред в сегмент "Списък" → context menu (Отвори в нов таб / Закачи).

Това премахва хоризонталния scroll с pill‑ове и вертикалния текст, и дава ясен overview.

## Долен segmented control

- 3 равни бутона: **Раздели / Списък / Работа**.
- Active state: gold underline + solid label; inactive: muted.
- Badge на "Работа" когато има dirty табове.
- Sticky, `env(safe-area-inset-bottom)` за iOS home indicator.
- Скрива се при scroll надолу (използваме съществуващия `useHideOnScroll`), показва се при scroll нагоре — за да не яде vertical space при четене на дълъг документ.

## Assistant (DogovaryAI) частен случай

Когато активната секция е `assistant`, сегмент 2 = чат панел на пълна ширина, сегмент 3 = quick‑actions (Създай документ, Анализ, Шаблони, Комплекти) като голяма grid‑мрежа вместо стиснат horizontal scroll bar. Сегмент 1 остава навигация.

## Технически детайли

- Breakpoint: `< 768px` (`useIsMobile`) → mobile shell. `≥ 768px` → съществуващият 3‑колонен layout остава непроменен.
- Нов компонент `ConsoleMobileShell.tsx` в `src/components/console/` — рендерира трите сегмента и segmented control.
- Swipe: използваме native CSS `scroll-snap` върху horizontal flex контейнер (`scroll-snap-type: x mandatory`, всеки панел `scroll-snap-align: start; width: 100dvw`). Без нова dependency, GPU‑ускорено, поддържа momentum на iOS.
- `useConsoleStore` разширяваме с `mobilePanel: "nav" | "list" | "work"` + `setMobilePanel(panel)`. Съществуващите `setSection` / `openTab` тригерират автоматичен преход към следващия сегмент само когато `isMobile`.
- `Console.tsx`: замяна на текущия mobile fallback (banner "завъртете екрана") с `{isMobile ? <ConsoleMobileShell /> : <DesktopShell />}`. Rotate hint премахнат.
- Нов `MobileTabDock.tsx` + `MobileTabsSheet.tsx` (използва shadcn `Sheet` от `side="bottom"`).
- Sidebar collapse логиката (`sidebarCollapsed` auto‑set на mobile) става ирелевантна за mobile — оставяме както е за safety при resize desktop→mobile.
- Touch targets ≥ 44px, `h-dvh` за пълна височина, всички цветове през дизайн токени (`text-foreground`, `bg-card`, `gold` accent). Без hardcoded hex.
- Пълна съвместимост с всички съществуващи Pane компоненти (`DealPane`, `DocumentPane` и т.н.) — те получават пълна ширина на екрана без промяна.

## Извън обхват (за отделна итерация)

- Пренаписване на самите Pane компоненти за mobile (само shell‑ът се променя сега; ако конкретен pane има вътрешни презастъпвания, ще ги адресираме отделно).
- Промяна на desktop поведението.
- Offline / PWA install prompt.

## Deliverables

1. `src/components/console/ConsoleMobileShell.tsx` — нов shell с 3 scroll‑snap панела.
2. `src/components/console/MobileSegmentedControl.tsx` — долен switcher с hide‑on‑scroll.
3. `src/components/console/MobileTabDock.tsx` + `MobileTabsSheet.tsx` — заместник на `ConsoleTabBar` на mobile.
4. `src/hooks/useConsoleStore.tsx` — добавка на `mobilePanel` state + auto‑advance при `setSection`/`openTab`.
5. `src/pages/Console.tsx` — branch по `useIsMobile()`, премахване на rotate‑hint банера.
6. Ръчна verification: screenshots на 393×618 през Playwright — навигация, отваряне на ред, swipe между сегменти, tab sheet.
