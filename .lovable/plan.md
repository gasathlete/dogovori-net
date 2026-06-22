## Цел
Модернизирам Hero + навигацията + Pricing секцията в "Soft Editorial Light" език (Stripe/Notion 2026), без да чупя текущата структура и съдържание. Лек polish, не пълна преработка.

## Палитра (semantic tokens в index.css)
- `--background`: #f5f3ee (топъл крем)
- `--surface`: #faf8f3
- `--foreground`: #2d2d2d
- `--muted`: #e8e4dd
- `--accent`: #c9a84c (gold) — само за ключови акценти, не за всичко
- `--border`: rgba(45,45,45,0.08)
- Запазвам съществуващата primary за CTA консистентност

## Типография
- Headings: **Instrument Serif** (елегантен display serif, 2026 trend)
- Body / UI: **Inter** (запазваме за четимост)
- Hero h1: tight tracking, mixed serif+italic за акцент дума
- Инсталация: `@fontsource/instrument-serif` + `@fontsource/inter` през bun add, import в `src/main.tsx`

## 1. Навигация (Header)
- Floating glass nav: `backdrop-blur-xl bg-background/70`, тънък border, leg радиус 9999px
- Свива се при scroll (по-малък padding след 40px)
- Лого ляво, links център (pill hover), CTA дясно (gold accent button)
- Мобилно: остава, но със същия floating стил

## 2. Hero секция
- Layout: центрирана, единична колона, generous whitespace (max-w-4xl)
- Eyebrow chip: малък pill "Нова версия 2026" с фин dot indicator
- H1: serif, голям (clamp 48-88px), с italic акцент на 1-2 думи (напр. *договори*)
- Sub: muted, max-w-2xl, line-height релаксиран
- Dual CTA: primary solid + ghost "Виж как работи →"
- Social proof row: лога/числа под CTA-та с opacity 60%
- Subtle grain texture overlay (SVG noise) за editorial усещане
- Без stock градиенти, без покемон-цветове

## 3. Hero bullets (7-те clickable items)
- Сегашната логика се запазва (паметова норма)
- Re-style като horizontal scroll chips на mobile, 2-row grid на desktop
- Hover: тънка underline (story-link стил), без heavy shadows

## 4. Pricing секция
- 3 карти в clean grid, equal height
- Featured plan (Предприемач): леко повдигната, gold border accent, "Най-избиран" badge serif italic
- Цени: големи serif числа, малък "€/мес." suffix
- Annual/Monthly toggle: pill switcher отгоре с savings бadge
- Feature listи: чек icons в muted, не зелено
- CTA: full-width per card, secondary outline за non-featured
- Top-up packs остават отдолу, restyled като horizontal card row
- Запазвам всички canonical цени (12.90/19.90/109, top-ups 2.90/5.40/12.90/23.90)

## 5. Micro-interactions
- Fade-in on scroll (Intersection Observer, веднъж)
- Hover lift на cards (translate-y-[-2px], shadow soft)
- Button: subtle scale 0.98 on press
- Reduced-motion safe

## Файлове за промяна
- `src/index.css` — нови tokens, grain texture util
- `tailwind.config.ts` — fontFamily serif/sans, accent color
- `src/main.tsx` — font imports
- `src/components/Hero.tsx`
- `src/components/Header.tsx` (или каквото е името на nav-а)
- `src/components/Plans.tsx`
- `src/components/TopupPacks.tsx`
- `src/pages/Index.tsx` (ако трябва section spacing)

## Извън обхват
- Assistant/Chat UI (не е избран)
- Console/Dashboard (не е избран)
- Промяна на бизнес логика, цени, ops квоти, Stripe продукти
- Промяна на текстовете (само структура/стил)

## Verification
- Build pass
- Playwright screenshot на /index desktop + mobile, сравнение преди/след
- Проверка на 7-те clickable bullets че още водят където трябва
