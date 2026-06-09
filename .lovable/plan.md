## Цел
Системно прецизиране на десктоп визията (1280–1920 px) — премахване на застъпвания на sticky ленти, фиксирани z-index конфликти, оразмеряване на герои/каруселa за ултрашироки екрани, читаеми редове в дълги текстове, изчистена страница Планове и подравнен Footer.

## Промени (групирани)

### A. Глобални / z-index йерархия
1. **`src/components/ui/dialog.tsx`** — диалогът да минава над всичко друго на десктоп. `DialogOverlay` и `DialogContent` → `z-[60]`. Същевременно базовият `overflow-y-auto` става conditional: `overflow-y-auto lg:overflow-visible lg:max-h-none` (на десктоп няма ненужен scrollbar; диалозите, които наистина имат много съдържание, си задават `max-h` явно).
2. **`src/components/FloatingAssistant.tsx`** — бутон и панел `z-50` → `z-40` (под диалозите).
3. **`src/components/CookieBanner.tsx`** — `z-50` → `z-[45]`.

### B. Hero и горна част на началната
4. **`src/components/Hero.tsx`** — `lg:min-h-[calc(100svh-4rem)]` → `lg:min-h-[min(calc(100svh-4rem),680px)]`; на `<h1>` се добавя `mx-auto max-w-2xl` за по-компактна геометрия на широки екрани.

### C. Wizard / Split — sticky слоеве
5. **CSS променлива за височината на лентите** (във `src/index.css`): `--header-h: 64px; --wizard-strip-h: 52px;` плюс util клас `.sticky-below-strip { top: calc(var(--header-h) + var(--wizard-strip-h)); }`.
6. **`src/pages/Wizard.tsx`**:
   - ред 933 (десен преглед): `lg:top-32 lg:max-h-[calc(100dvh-9rem)]` → `lg:top-[calc(var(--header-h)+var(--wizard-strip-h))] lg:max-h-[calc(100dvh-var(--header-h)-var(--wizard-strip-h)-1rem)]`.
   - ред 644 (utility band за празна бланка): прави се sticky веднага под progress strip-а, `z-20`, за да не изчезва при скрол.
7. **`src/pages/BuildContract.tsx:1397`** — същата корекция на sticky offset.
8. **`src/components/wizard/SplitWizard.tsx`** — добавя се `stickyTop?: string` проп (default `"lg:top-20"` за страници без progress strip); прилага се на `<section className={cn("lg:sticky lg:overflow-y-auto", stickyTop, "lg:max-h-[calc(100dvh-7rem)]")}>`. Wizard.tsx и BuildContract.tsx ще подадат правилния offset.

### D. Carousel "Платформата" (десктоп)
9. **`src/components/PlatformShowcase.tsx`** — добавяне на `lg:h-[720px] xl:h-[780px]` на сцената; на картите `lg:h-[680px] xl:h-[740px]` с пропорционални `-mt` стойности; kicker chip с `md:max-w-[10rem] lg:max-w-[12rem]`.

### E. Дължина на ред / типография
10. **`src/pages/BlogPost.tsx:123`** — `prose ... max-w-none` → `prose ... max-w-prose mx-auto`.
11. **`src/pages/Template.tsx:278`** — същото.
12. **`src/components/FAQ.tsx`** — `AccordionContent` получава `max-w-prose`.
13. **`src/pages/BlogPost.tsx:186`** — related секцията получава `mx-auto max-w-3xl` и `lg:grid-cols-2`, за да съвпада с ширината на статията.
14. **`src/pages/Catalog.tsx:181`** — `lg:leading-[1.15]` на заглавието.

### F. Pricing / Plans
15. **`src/pages/Plans.tsx:135`** — `gap-5` → `gap-6 xl:gap-7`; на маркираната карта се добавя `overflow-visible` за beam ефекта.
16. **`src/pages/Plans.tsx:251`** — таблицата се завива в `<div className="mx-auto max-w-4xl overflow-x-auto">`.

### G. Footer
17. **`src/components/Footer.tsx`** — на link контейнера `lg:flex-nowrap`, на връзките `sm:whitespace-nowrap`; на главния flex ред — `xl:gap-12`, на лого колоната `min-w-[220px]`.

### H. Тестимониали и PainSolution
18. **`src/components/Testimonials.tsx`** — `w-[320px] sm:w-[360px]` → добавя се `lg:w-[400px] xl:w-[440px]`.
19. **`src/components/PainSolution.tsx`** — `max-w-5xl` → `max-w-5xl lg:max-w-6xl`.

### I. Модални прозорци
20. **`src/components/TeaserDialog.tsx`** — `min-h-[7rem]` → `min-h-[9rem]` за стабилен превключвател между слайдове на десктоп.
21. **`src/pages/UploadedContract.tsx:516`** — `max-h-[85vh]` → `max-h-[min(85vh,900px)]`; вътрешният текстов блок `max-h-[50vh]` → `max-h-[40vh] lg:max-h-[55vh]`.

### J. CTA консистентност
22. **`src/components/CTABand.tsx:95`** — `sm:text-xl sm:px-14 sm:py-6` → `sm:text-xl sm:px-14 sm:py-6 lg:px-10 lg:py-4 lg:text-lg` за хармония с останалите CTA-ове.

## Извън обхват
- Не пипам бизнес логика, бекенд, security, payments.
- Мобилните корекции от предишния тур остават.
- Цветове и брандинг — без промяна.

## Верификация
- `browser--view_preview` на 1366×768, 1440×900 и 1920×1080 за маршрутите: `/`, `/catalog`, `/template/...`, `/wizard`, `/upload`, `/plans`, `/blog`, `/blog/...`.
- Проверка: няма sticky lenti, които се припокриват; диалогите се отварят без scrollbar когато съдържанието е късо; редовете в дълги текстове са под ~75ch; floating assistant не блокира модал.
- Скриншот before/after за: Hero, Plans, PlatformShowcase, BlogPost.
