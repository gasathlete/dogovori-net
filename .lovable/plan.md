## Цел
Дигитален, модерен, последователен onboarding tutorial — full-screen модално slideshow — който се пуска автоматично веднъж след първи login и може да се рестартира по всяко време от настройките на профила. Покрива всички ключови функционалности с реални embed-и от сайта.

## 1. Структура на туториала (8 слайда)

`src/components/onboarding/OnboardingTour.tsx` — full-screen Dialog (z-index над всичко), прогрес бар, Next/Prev/Skip/Finish, ESC = skip, keyboard arrows, focus trap.

Всеки слайд = `{ id, title, subtitle, body, previewComponent, ctaLabel, ctaHref }`. `previewComponent` рендира реален мини-snapshot от продукта (не статични PNG-та).

| # | Слайд | Preview component |
|---|---|---|
| 0 | **Intro** — "AI правен и преговорен асистент от последно поколение" | `NegotiationModePreview` (анимиран изглед на режим преговори от `/console`) |
| 1 | **Намери или създай документ** | Live SearchBar + 3 топ темплейта от `catalog.top.json` |
| 2 | **Свали бланка или попълни през системата** | Split-view: бланка карта vs Wizard стъпка |
| 3 | **Анализирай рисковете и подпиши електронно** | Risk meter (от `AnalysisPane`) + SignaturePad миниатюра |
| 4 | **Комплекти / създай собствен** | KitCard grid от `DOCUMENT_KITS` + "+ Нов комплект" |
| 5 | **Качи документ за анализ** | Dropzone компонент (read-only demo) |
| 6 | **Папки, контрагенти, Workspace** | Mini folder tree + contacts list от профила |
| 7 | **DogovaryAI — не се колебай да договаряш** | Chat bubble мокъп с примерен преговорен ход |

Всеки слайд има "Опитай сега" бутон → навигира към реалната страница и затваря модала.

## 2. Auto-trigger след първи login

**Схема:** `profiles.tutorial_seen_at timestamptz NULL` (миграция).

`src/components/onboarding/OnboardingProvider.tsx` mount-ва се в `App.tsx` под `AuthProvider`:
- При `user` set → fetch `profiles.tutorial_seen_at`
- Ако е `null` → отвори OnboardingTour
- При Skip / Finish → `UPDATE profiles SET tutorial_seen_at = now()`

Fallback: `localStorage("tutorial_seen_v1")` за SSR-flash гард.

## 3. Replay от настройки

В `/account` → Settings tab → нова секция "Помощ и обучение":
- Бутон "Пусни въведението отново" → `setTutorialOpen(true)` (без да нулира `tutorial_seen_at`)
- Линк "Прескочи завинаги" (toggle)

## 4. "Добави в комплект" интеграция (минимална)

Преизползва съществуващите `document_kits` / `document_kit_items` + `src/lib/kits.ts` + `AddToKitDialog.tsx`.

**Добавяне на бутон "+ Добави в комплект" на:**
- `TemplatePane.tsx` (страница на шаблон) — до бутоните за download
- `CatalogCard` в `/catalog` — малка икона top-right на hover
- `MyKitDetail.tsx` — вече има, оставяме
- `UploadedPane.tsx` — за качени документи

Бутонът отваря `AddToKitDialog` с pre-selected документ; диалогът позволява:
- Избор от съществуващи kits (listMyKits)
- "Създай нов комплект" inline (createKit + addItemToKit)

Без нови таблици, без drag&drop, без нов раздел в профила.

## 5. Файлове

**Нови:**
- `src/components/onboarding/OnboardingTour.tsx`
- `src/components/onboarding/OnboardingProvider.tsx`
- `src/components/onboarding/slides/` (8 preview компонента)
- `src/components/onboarding/tutorialSteps.ts`
- `supabase/migrations/*.sql` (добавя `tutorial_seen_at` към `profiles`)

**Редактирани:**
- `src/App.tsx` — wrap с `OnboardingProvider`
- `src/pages/Account.tsx` (или relevant settings tab) — replay бутон
- `src/components/console/panes/TemplatePane.tsx` — Add-to-kit бутон
- `src/components/console/panes/UploadedPane.tsx` — Add-to-kit бутон
- Catalog card компонент — Add-to-kit икона
- `src/i18n/locales/bg/common.json` + `en/common.json` — нови ключове `onboarding.*`

## 6. Дизайн

- Full-screen Dialog, max-w-5xl на desktop, full-bleed на mobile
- Лява колона: title + body + CTA; дясна колона: live preview
- Прогрес: тънка лента отгоре + "Стъпка 3 от 8" под нея
- Анимации: fade + slide-left при Next (framer-motion-style чрез tailwind animate-in)
- Темата следва съществуващите gold/accent токени

## 7. Тестове

- `src/test/onboarding.test.tsx` — slide navigation, skip marks seen, replay не нулира
- `src/test/kits.test.ts` — extend with add-from-template path
