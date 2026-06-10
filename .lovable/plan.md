## Цели

1. По-голяма, по-четима типография в цялата платформа.
2. По-ясна йерархия и spacing в landing секциите.
3. Партньорска секция с големи лога в grid (като референцията Правен Интелект).
4. Светла тема с toggle в Header (тъмната остава по подразбиране), палитра Paper & Gold — `#faf8f3 / #ffffff / #0f1b3d / #c9a84c`.

---

## 1. Светла тема (Paper & Gold)

**Подход:** `tailwind.config.ts` вече има `darkMode: ["class"]`. В момента всички токени са в `:root` (тъмни) — те ще се преместят в `.dark` блок, а `:root` ще съдържа светлите. По подразбиране ще слагаме `class="dark"` на `<html>` за обратна съвместимост, а toggle ще го превключва.

**`src/index.css`:**
- Преструктуриране на токените:
  - `:root` → светла Paper & Gold палитра:
    - `--background: 42 40% 97%` (paper #faf8f3)
    - `--foreground: 220 60% 12%` (deep navy #0f1b3d)
    - `--card: 0 0% 100%`, `--card-foreground: 220 60% 12%`
    - `--muted: 42 25% 92%`, `--muted-foreground: 220 20% 38%`
    - `--border: 220 15% 88%`, `--input: 220 15% 92%`
    - `--gold: 43 55% 48%` (леко по-тъмно за контраст върху paper), `--gold-light: 43 70% 60%`, `--gold-dark: 43 60% 35%`
    - `--navy: 220 60% 12%`, `--navy-light: 220 30% 22%`
    - `--primary: 43 55% 48%`, `--primary-foreground: 0 0% 100%`
    - `--surface-1/2/3`, `--hairline`, `--sidebar-*` светли еквиваленти
    - Светли версии на `--gradient-hero`, `--gradient-card`, `--gradient-radial`, `--shadow-elegant/soft/gold`
  - `.dark { ... }` → текущите тъмни токени без промяна.
- Body/scrollbar/selection селектори, които използват хардкоднати `hsl(220 ...)`, се пренасочват към съответните токени, за да не остават тъмни в light режим (scrollbar track, selection background).
- Header има хардкодирано `bg-navy` — ще се замени с `bg-background` + правилен border token, за да реагира на темата.

**Theme toggle:**
- Нов хук `src/hooks/useTheme.tsx` (Provider + `useTheme()`):
  - State: `"dark" | "light"`, persist в `localStorage["dogovori:theme"]`.
  - При mount: чете localStorage; ако няма стойност → `"dark"` (запазваме текущото поведение).
  - Прилага `document.documentElement.classList` toggle `"dark"`/`"light"`.
- Wrap-ва приложението в `src/App.tsx` около `<BrowserRouter>`.
- Нов `src/components/ThemeToggle.tsx` — icon-only бутон Sun/Moon, добавя се в `Header.tsx` до `ToolsMenu` (desktop + mobile меню).
- Update в `index.html`: inline-скрипт преди React mount чете `localStorage` и слага `dark`/`light` клас на `<html>`, за да предотврати flash.

**Компоненти за проверка/корекция (хардкодирани тъмни цветове):**
- `Header.tsx` — `bg-navy` → `bg-background`, ring color tokens.
- `Hero.tsx` — `bg-navy-light/40`, `bg-navy/95` в tooltip → token-based варианти.
- `PartnersBoard.tsx` — inline `linear-gradient(... hsl(220 38% 11%) ...)` → token-driven `var(--gradient-card)`.
- `SocialProofStrip.tsx` — `grayscale` opacity-50: в light режим логата трябва да са четливи (премахваме grayscale и в двата режима — виж точка 3).
- Footer `bg-navy-light/40` → `bg-card/40`.
- Бързо search-and-replace audit за `text-white`, `bg-black`, `bg-navy*` директни класове, които не идват от tokens.

---

## 2. По-голяма, по-ясна типография (глобално)

**`src/index.css` base layer:**
- `html { font-size: 17px }` на desktop (от browser default 16). Mobile fallback `15.5px` под `@media (max-width: 640px)`.
- Глобален `body { font-size: 1rem; line-height: 1.65 }`.
- Heading scale (минимални промени, но навсякъде):
  - `h1` base размер `clamp(2rem, 4.5vw, 3.4rem)`, line-height 1.1
  - `h2` `clamp(1.6rem, 3.2vw, 2.4rem)`, line-height 1.2
  - `h3` `clamp(1.25rem, 2.2vw, 1.65rem)`, line-height 1.3
  - `h4` 1.15rem
  - Прилагат се в `@layer base` за всички страници (wizard/console също се повишават умерено — не екстремно).
- Eyebrow остава `text-[11px]` (вече работи).
- Prose в `LegalLayout` се повишава: текстът от `text-sm` → `text-base`, h2 от `text-xl` → `text-2xl`, h3 от base → `text-xl`.

**`Hero.tsx`:**
- H1 размери: `text-4xl sm:text-5xl md:text-6xl lg:text-[64px]` (от текущите `text-[28px]…xl:text-[52px]`).
- Подзаглавието `text-base sm:text-lg md:text-xl`, line-height 1.6.
- CTA secondary бутоните от `text-[14px]` → `text-[15px]`, padding по-просторен.

**`PartnersBoard.tsx`, `LifeScenarios`, `FeaturedBlanks`, `ComparisonTable`, `Process`, `Testimonials`, `FAQ`, `ComplianceSection`, `CTABand`, `PainSolution`, `PlatformShowcase`:**
- Section heading унификация: `font-serif text-3xl sm:text-4xl md:text-5xl` (досега са `text-xl…md:text-3xl` — твърде малки).
- Subline копи: `text-base sm:text-lg`, max-w-2xl, mx-auto.
- Vertical rhythm: section padding `py-20 sm:py-24 md:py-28` (от текущите `py-14 md:py-20`).
- Eyebrow + heading gap: `mb-4` → `mb-5`; heading + body gap: `mt-3` → `mt-5`.

---

## 3. Партньорска секция — големи лога в grid

**`src/components/PartnersBoard.tsx` пълен рефактор:**
- Премахваме marquee/loop логиката.
- Heading секцията остава, но с новата типография (`text-3xl sm:text-4xl md:text-5xl`).
- Layout: responsive grid
  - `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6`
- Всяка карта:
  - `bg-card border border-border rounded-xl`
  - `h-40 sm:h-44 md:h-48` фиксирана височина, `flex items-center justify-center`
  - `p-6 sm:p-8`
  - Hover: `border-gold/40`, лек `shadow-soft`, transition
- Изображения:
  - `max-h-[72%] max-w-[80%] object-contain`
  - Премахваме `opacity-80` и grayscale — логата са в пълен цвят (както в референцията).
  - `loading="lazy"`, `decoding="async"`.
- Ако партньорите са > 12, добавяме „Виж всички" / pagination режим (initial 12, бутон „Покажи още"). Ако ≤ 12, всички се показват.
- Премахваме декоративните corner-ticks от външния frame (frame-ът отпада изобщо).

**`src/components/SocialProofStrip.tsx`:**
- Запазваме горната тънка лента като trust strip, но:
  - Логата стават `h-9 sm:h-10`, `max-w-[140px]`.
  - Премахваме `grayscale` и `opacity-50` (отива на `opacity-70 hover:opacity-100`), за да работят и в светла, и в тъмна тема.

---

## 4. Технически детайли

**Файлове за създаване:**
- `src/hooks/useTheme.tsx` — ThemeProvider + хук.
- `src/components/ThemeToggle.tsx` — Sun/Moon icon бутон.

**Файлове за редакция:**
- `src/index.css` — пълно преструктуриране на токените `:root` / `.dark`, базова типография, scrollbar/selection token-ize.
- `index.html` — inline no-flash скрипт.
- `src/App.tsx` — ThemeProvider wrap.
- `src/components/Header.tsx` — добавяне на ThemeToggle, замяна на `bg-navy` → `bg-background`.
- `src/components/Hero.tsx` — типография upscale, token-ize на навy hardcodes.
- `src/components/PartnersBoard.tsx` — grid рефактор.
- `src/components/SocialProofStrip.tsx` — по-големи логата, премахване на grayscale.
- `src/components/Footer.tsx` — token-ize.
- `src/pages/legal/LegalLayout.tsx` — по-голяма prose типография.
- Кратък sweep за всички landing секции (`LifeScenarios`, `FeaturedBlanks`, `ComparisonTable`, `Process`, `Testimonials`, `FAQ`, `PainSolution`, `PlatformShowcase`, `ComplianceSection`, `CTABand`) — само section heading + sub + section padding.

**Без промяна:**
- Бизнес логика, цени, маршрути, backend.
- Wizard / Console layouts — само наследяват глобалния font-size bump, без други корекции.

**Verification:**
- Преглед на preview в desktop + mobile viewport за: hero, partners, footer.
- Toggle dark↔light, проверка че няма flash и че localStorage persist-ва.
- Бърза проверка че няма счупени hardcoded цветове в основните секции.
