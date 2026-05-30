## Финална полировка – Catalog / Template / Auth

Прилагаме същия премиум tone от Index върху останалите ключови публични страници. Само frontend, без бизнес логика.

### 1. Catalog (`src/pages/Catalog.tsx`)
- Hero/заглавна зона: eyebrow + serif heading с `text-balance`, staggered fade-in (`anim-rise`).
- Search/filter bar: фин border, focus-visible gold ring, sticky при scroll с по-плътен фон (`useScrolled`).
- Резултатни карти: hover lift `-translate-y-0.5`, gold corner ticks при hover, `decoding="async"` на иконки/изображения.
- Празно състояние ("няма резултати"): premium re-style – eyebrow + serif heading + gold CTA "Изчисти филтри".
- Skeleton grid докато се зареждат темплейтите (вместо blank).
- `Reveal` wrapper на секциите под fold.
- Section divider (`hairline-x`) между filter bar и резултатите.

### 2. Template (`src/pages/Template.tsx`)
- Header блок с име на шаблона: eyebrow tracking, `text-balance` h1, мета (категория, време за попълване) с по-добра типография.
- Primary CTA "Започни" → `btn-gold btn-sheen` (hover sweep).
- Related templates секция: hover ticks, story-link на линкове.
- Sticky sidebar (ако има): subtle border + scroll state.
- FAQ/съдържание: `prose` тунинг, по-добър rhythm, `Reveal` на блокове.
- Loading state: skeleton (heading + paragraph + CTA placeholder).

### 3. Auth (`src/pages/Auth.tsx`)
- Card layout: по-фин border (`border-gold/20`), субтилен gold glow shadow, centered с увеличен top spacing.
- Brand block над формата: малко лого + eyebrow "dogovori.net" + serif "Вход / Регистрация".
- Tabs (Sign in / Sign up): premium pill style, активен с gold underline.
- Google бутон: по-високо в йерархията, иконка ляво, "Продължи с Google" – `btn-sheen` hover.
- Divider "или с имейл" с hairline + gold dot center.
- Inputs: focus-visible gold ring, по-добър placeholder контраст.
- Error states: subtle danger card вместо raw text.
- Loading: spinner в primary CTA при async submit.
- Reduced-motion guards навсякъде.

### 4. Глобални micro-fixes
- Проверка на `text-muted-foreground/50` и hardcoded цветове по тези 3 файла → tokens.
- `NotFound.tsx`: вече в плана, prem re-style (eyebrow + serif + gold CTA "Към началото").
- App.tsx: `route-fade` обвивка на `<Outlet>` за плавен преход между страници.

### Файлове, които ще се пипат
- `src/pages/Catalog.tsx`
- `src/pages/Template.tsx`
- `src/pages/Auth.tsx`
- `src/pages/NotFound.tsx`
- `src/App.tsx` (route transition wrapper)
- `src/index.css` (ако трябва нов utility – само добавки)

### Извън scope
- Wizard, Account, Admin, Team – ако искаш да продължим и там, отделен batch.
- Бекенд / auth flow / payments – без промени.
- Копи и текстове – запазват се както са.

### Подход
Един batch, всичко наведнъж. След това бърз QA на mobile (393px) + tab navigation + reduced-motion.
