## Намерени проблеми (тествано на 390×844)

### 1. Header — претрупан и прелива (`src/components/Header.tsx`)
На мобилно се събират едновременно: лого + субтитър "Архитект на Вашите сделки" + бутон "Профил/Вход" с икона + хамбургер. Резултат: дясната страна излиза извън viewport-а (виждат се скрол ивици), spacing между елементите е счупен.

### 2. Account — табове се препокриват с контента (`src/pages/Account.tsx:146-154`)
7 таба с `flex-wrap` се пренасят на 3 реда на мобилно. Втори/трети ред реално се припокриват с картата на активния таб (Pro/абонамент карта прелива над "Папки", "Настройки", "Абонамент"). Това е най-сериозният визуален бъг.

### 3. Account — header ред (`src/pages/Account.tsx:125-143`)
"Към началото / Моят профил / email" и бутон "Изход" (+ "Модераторски панел" за staff) са на един `flex justify-between` ред — на мобилно "Изход" се притиска до заглавието; при staff потребител "Модераторски панел" чупи реда.

### 4. Ценови грид (`src/pages/Account.tsx:694`)
4 плана използват `md:grid-cols-2 lg:grid-cols-4` — на мобилно се рендерират като една дълга колона с по-широки карти, но без visual hierarchy (Pro месечен трябва да е първи/изпъкнал на mobile).

### 5. Hero (`src/components/Hero.tsx`)
Като цяло работи, но `py-12` + голяма h1 (`text-[28px]`) + дълъг параграф създават много vertical space преди CTA на малки екрани. Eyebrow chip е на 2 реда.

### 6. Top banner "Test mode" (`PaymentTestModeBanner`)
Заема пълен ред със `text-sm` — добавя ненужна височина на mobile.

---

## План за корекции (само presentation/CSS, без бизнес логика)

### A. Header
- Скрий субтитъра "Архитект на Вашите сделки" под `sm` (показвай само логото + името).
- На мобилно: icon-only бутон Профил/Вход (само иконата, текстът се показва от `sm:` нагоре).
- Намали `gap-3` → `gap-2`, добави `min-w-0` + `truncate` на лого секцията.

### B. Account табове (`Account.tsx:146-154`)
Замени `flex flex-wrap` с хоризонтално-скролиращ ред на мобилно:
```
flex w-full gap-1 overflow-x-auto scrollbar-none md:flex-wrap md:overflow-visible
```
Добави `whitespace-nowrap shrink-0` на всеки `TabsTrigger`. Това решава припокриването.

### C. Account heading (`Account.tsx:125-143`)
- Сложи `flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.
- Бутоните "Изход" / "Модераторски панел" — стани `w-full sm:w-auto`, `size="sm"` на mobile.

### D. Ценови грид (`Account.tsx:693-775`)
- Mobile: `grid-cols-1`, Pro месечно карта първа в DOM-а на мобилно (или `order-first md:order-none`), за да е видим топ оферта.
- Намали `p-6` → `p-5` на mobile.
- Малки шрифтове за цени на mobile: `text-2xl sm:text-3xl`.

### E. Hero (`Hero.tsx`)
- `py-12` → `py-10` на mobile.
- Eyebrow chip: по-кратък текст или `text-[9px]` на най-малки екрани, `flex-wrap` за да не overflow-ва.
- Намали max-width на параграфа за по-плътно темпо.

### F. Test-mode banner
- На mobile: `text-xs` + `py-1.5` вместо `text-sm py-2`.

### G. Footer "Powered by IM Development" в Header
Виж дали се скрива под `sm` правилно (вече е `hidden sm:inline-flex`) — ОК.

### H. Бърз check на Wizard / Document / Catalog
Те изглеждат добре на mobile, но ще проверя за `min-w` overflow по време на implementation (бутони, badges).

---

## Технически детайли
- Файлове: `Header.tsx`, `Logo.tsx` (опционално skeleton за subtitle), `pages/Account.tsx`, `components/Hero.tsx`, `PaymentTestModeBanner.tsx`.
- 0 миграции, 0 edge functions.
- Тествам резултата на 390×844 (iPhone 12) преди финал.

Очакван ефект: чист header без overflow, табовете в Account работят с хоризонтален скрол вместо да се натрупват, ценовият грид е четим на mobile, цялостно по-плътен spacing на hero.