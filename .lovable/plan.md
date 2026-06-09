## Цел
Премахване на застъпвания, хоризонтален скрол, отрязан текст и счупени диалози/менюта в мобилния изглед (≤390 px) по цялото приложение — Начална, Wizard, Качване и анализ, Каталог/Шаблон/Сектор/Блог.

## Какво ще се промени

### A. Глобални предпазители (поправят 80% от случаите наведнъж)

1. **`index.html`** — премахване на `maximum-scale=1.0, user-scalable=no` от `<meta viewport>` (WCAG fail, блокира pinch-zoom). Запазва се `viewport-fit=cover`.
2. **`src/index.css`** — добавяне в `@layer base`:
   - `html, body { overflow-x: hidden; max-width: 100vw; }`
   - `* { min-width: 0; }` (позволява truncate във flex/grid деца)
   - `img, video, svg, table, pre { max-width: 100%; }`
   - `p, h1, h2, h3 { overflow-wrap: break-word; }`
   - Премахване на остарелия `-webkit-overflow-scrolling: touch`.

### B. Диалози и оверлеи

3. **`src/components/ui/dialog.tsx`** — на базовия `DialogContent` се добавят `max-h-[90dvh] overflow-y-auto` + `w-[calc(100vw-2rem)]`, така че всички диалози в проекта (TeaserDialog, ShareForSign, UploadContract, и т.н.) се поправят наведнъж.
4. **`src/components/ui/sheet.tsx`** — `SheetContent` получава `overflow-y-auto` и `flex flex-col`.
5. **`src/components/TeaserDialog.tsx`** — `px-10` → `px-6 sm:px-10`; заглавието `h3` получава `break-words`.

### C. Sticky `100vh` → `100dvh` (iOS bar причинява изрязване)

6. **`src/components/AssistantChat.tsx:225`**, **`FloatingAssistant.tsx:44`**, **`Wizard.tsx:933`**, **`BuildContract.tsx:1397`**, **`wizard/SplitWizard.tsx:423`**, **`wizard/WizardShell.tsx:81`** — `100vh`/`h-screen`/`min-h-screen` → `dvh` варианти.

### D. Карусел Платформата (главният източник на overflow на началната)

7. **`src/components/PlatformShowcase.tsx`** — слайдовете `w-[300px] -ml-[150px]` стават `w-[min(300px,85vw)]` с пропорционален `-ml`; caption блокът получава `overflow-hidden`; kicker chip-ът — `max-w-[8rem] truncate`.

### E. Wizard / Качване

8. **`src/components/wizard/QuestionField.tsx:89`** — премахване на `min-w-[200px]` от `SelectTrigger`, заменя се с `w-full`.
9. **`src/pages/Account.tsx`** TabsList — `min-w-0` на тригерите + потвърждаване на `overflow-x-auto` на контейнера.

### F. Начална страница и съдържание

10. **`src/components/Hero.tsx:131`** — премахване на `whitespace-nowrap` от частта „търсят и намират".
11. **`src/components/ProtectedContent.tsx:44`** — `overflow-hidden` на най-близкия предшественик на ротирания watermark.
12. **`src/pages/BlogPost.tsx:123`** — на `prose` контейнера се добавя `[&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto`.
13. **`src/pages/Blog.tsx:80`** — добавя се `sm:text-4xl` и `hyphens-auto` на хедъра.
14. **`src/pages/Catalog.tsx:284`** — `min-w-[200px]` → само `shrink-0`.

## Технически детайли

- Tailwind вече поддържа `dvh`/`min-h-dvh` (v3.4+). Където стойностите са в arbitrary class-ове (`h-[calc(100vh-…)]`), сменям `100vh` на `100dvh`.
- За старите браузъри без `dvh` (<1.5% трафик), `100vh` остава като естествен fallback чрез `@supports`.
- Не пипам бизнес логика, payments, security, бекенд миграции. Само presentation код.

## Верификация

- След промените: `browser--view_preview` на 390×844 и 360×800 за: `/`, `/wizard`, `/upload`, `/catalog`, `/template/<slug>`, `/blog`, `/blog/<slug>`.
- На всеки от тези маршрути ще проверя `document.documentElement.scrollWidth <= window.innerWidth` (без хоризонтален скрол) и че диалозите се скролват.
- Скриншот преди/след за карусела на Платформата и Hero.

## Извън обхват
- Не сменям дизайна или съдържанието.
- Не реорганизирам компоненти, не премествам секции.
- Десктоп изгледът остава непроменен (всички правки са или мобил-специфични, или подобряват и десктоп без визуална регресия).
