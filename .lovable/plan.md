# Linear-style редизайн на началната страница

Цел: Превръщаме `/` от „каталог + блог витрина" в SaaS landing страница по 8-стъпковата психологическа логика, в Linear естетика (тъмен фон, gold акценти, плътна типография, продуктови скрийншоти, премерени микро-интеракции).

## Нова структура на `Index.tsx`

```text
1. Hero                  (рефакториран — single CTA + ⌘K hint)
2. SocialProofStrip      (Partners изместен нагоре, тънка лента с лога)
3. PainSolution          [НОВО]  „Преди / След" 2 колони
4. PlatformShowcase      (запазен — основните features с реален UI)
5. FeaturedBlanks        (запазен — Топ 5 най-търсени)
6. LifeScenarios         (запазен, преместен по-надолу)
7. ComparisonTable       [НОВО]  Dogovori.net vs адвокат vs безплатни PDF
8. Testimonials          (запазен + ако има цифри, ги извеждаме напред)
9. Process               (запазен — „как работи системата")
10. FAQ                  [НОВО]  5–6 въпроса
11. ComplianceSection    (запазен — последна доза доверие)
12. CTABand              (рефакториран — финален „Започни безплатно")
13. SeoFooter
```

Премахваме от homepage: `BlogRotator` (мести се само в `/blog`), `TopDocuments` (дублира `FeaturedBlanks` — оставяме само едното), `SectorGrid` (мести се в footer като линкова мрежа за SEO, не като пълна секция). Това намалява scroll length с ~30% и фокусира потребителя.

## Hero — Linear-style рефакторинг

`src/components/Hero.tsx`:
- **Един основен CTA**: `Започни безплатно — 5 операции` (primary, gold). Вторичен дискретен link: `Виж демо ↓` (скрол към PlatformShowcase).
- **Keyboard shortcut hint**: малък pill под CTA-та — `Натисни ⌘K за бързо търсене` с реално работещ `⌘K` / `Ctrl+K` shortcut, който отваря `/catalog` с фокус върху search input-а.
- **Микро-интеракции (level 4)**:
  - Магнитен ефект на primary CTA (бутонът се измества ~6px към курсора при hover, spring transition).
  - Cursor-aware glow на hero медальона (radial gradient следва позицията на мишката).
  - Subtle parallax на corner filigree при mouse move (transform: translate ±3px).
  - `prefers-reduced-motion` — всички ефекти изключени.
- **Trust chips**: запазваме редицата ЗЗД·ТЗ·ЗУТ, но я правим по-плътна (по-малък размер, по-високо tracking).
- Премахваме „Виж повече" разкриващия параграф — Linear не държи скрит текст в Hero.

## Нова секция: `PainSolution`

`src/components/PainSolution.tsx` (нов файл):
- 2 колони на десктоп, stacked на мобилно.
- Лява колона (мута, червеникав акцент): „Без Договори.нет" — 3 bullet-а с проблеми („Плащате 150–400€ на адвокат за стандартен договор", „PDF шаблоните в Google нямат риск-анализ", „Грешка в клауза = загубена сделка").
- Дясна колона (gold акцент): „С Договори.нет" — 3 bullet-а с резултати („9.90€/месец за 100 документа", „AI риск-анализ на всеки документ", „Електронен подпис в 2 минути").
- Между колоните вертикална hairline + малък диамант (повтаряме hero accent-а).

## Нова секция: `ComparisonTable`

`src/components/ComparisonTable.tsx` (нов файл):
- 4 колони: критерий | **Dogovori.net** (gold highlight) | Адвокат | Безплатни PDF сайтове.
- 6 реда: Цена за документ · Време · Юридическа валидност · AI риск-анализ · Електронен подпис · Поддръжка/корекции.
- Иконки: ✓ (gold), ✗ (muted), частично (gold/40).
- Sticky първа колона на мобилно с хоризонтален скрол.

## Нова секция: `FAQ`

`src/components/FAQ.tsx` (нов файл), използва съществуващия shadcn `Accordion`:
1. Документите валидни ли са пред НАП, съд и нотариус?
2. Какво се случва с моите данни? (GDPR + криптиране)
3. Мога ли да спра абонамента по всяко време?
4. Какво е безплатно и какво плащам?
5. Имам ли право на корекции след генериране?
6. Електронният подпис правно обвързващ ли е в България?

Добавя `FAQPage` JSON-LD за rich snippets в Google.

## Social Proof лента

`src/components/SocialProofStrip.tsx` (нов файл, лек, не сменя `PartnersBoard`):
- Тънка лента веднага под Hero: `Използван от 500+ адвокати, счетоводители и предприемачи` + grayscale ред с 6–8 лога от `partners` (reuse на същия fetch с guard).
- Пълният `PartnersBoard` остава по-надолу или се премахва в полза на лентата — ще решим в имплементацията кое е по-добро визуално.

## ⌘K глобално търсене

`src/components/CommandPalette.tsx` (нов файл), използва shadcn `Command` + `Dialog`:
- Hotkey: `⌘K` / `Ctrl+K` (mount-нат глобално в `App.tsx`).
- Източник: `templateIndex.allTemplates()` (вече съществува).
- Резултат: до 8 шаблона + 3 действия („Изготви документ", „Виж каталог", „Моите документи").
- Esc затваря, Enter навигира към `/shablon/:slug`.

## Микро-интеракции (level 4) — глобален упгрейд

В `src/index.css`:
- Нов `.magnetic-hover` utility (CSS transform базиран, без JS) за вторични бутони.
- Нов `.linear-card` utility: тънка горна gold hairline се появява при hover, плюс много фин inner glow.
- Подсилваме `.btn-gold` с press state (scale 0.98 + по-тъмен gold) — Linear-style tactile feedback.
- Запазваме `prefers-reduced-motion` гардовете.

За magnetic CTA в Hero — лек JS хендлър (rAF-throttled mousemove → transform). Само на десктоп (`matchMedia("(hover: hover)")`).

## Header — намалена навигация

`src/components/Header.tsx`:
- Текущо: `Изготви документ · Каталог · Комплекти · Сектори · Блог` (5 линка).
- След: `Каталог · Комплекти · Цени · Блог` (4 линка, „Изготви документ" мигрира към CTA в Hero/header дясно).
- Десният CTA „Започни безплатно" става primary gold бутон (не ghost).
- ⌘K иконка/индикатор до CTA на десктоп.

## Файлове за промяна / създаване

**Нови:**
- `src/components/PainSolution.tsx`
- `src/components/ComparisonTable.tsx`
- `src/components/FAQ.tsx`
- `src/components/SocialProofStrip.tsx`
- `src/components/CommandPalette.tsx`
- `src/hooks/useCommandPalette.ts` (open/close state + hotkey)
- `src/hooks/useMagneticHover.ts`

**Редактирани:**
- `src/pages/Index.tsx` — нов ред на секциите, премахване на `BlogRotator`/`TopDocuments`/`SectorGrid` от homepage, добавяне на новите lazy chunks.
- `src/components/Hero.tsx` — single CTA, ⌘K hint, magnetic hover, премахване на „Виж повече".
- `src/components/Header.tsx` — намалена nav, gold CTA, ⌘K индикатор.
- `src/components/CTABand.tsx` — финален CTA копи + design refresh.
- `src/App.tsx` — mount на `CommandPalette` глобално.
- `src/index.css` — `.magnetic-hover`, `.linear-card`, press states.
- `src/components/Seo.tsx` или директно в `Index.tsx` — FAQPage JSON-LD.

## Технически детайли

- Всички нови секции са lazy-loaded през `LazyOnVisible` + `React.lazy` (запазваме performance работата от предишните цикли).
- Новите компоненти използват само semantic tokens (`text-gold`, `bg-navy`, `text-muted-foreground`) — никакви hardcoded цветове.
- ⌘K palette използва съществуващия `templateIndex` (без нов API call).
- Magnetic hover е изключен на touch устройства през `matchMedia("(hover: hover) and (pointer: fine)")`.
- FAQ accordion използва нативен shadcn компонент (вече в проекта) — без нови зависимости.
- JSON-LD `FAQPage` се сериализира заедно с текущия `ItemList` JSON-LD в `Seo.tsx`.

## Какво НЕ правим в този цикъл

- Не пипаме `/build`, `/catalog`, `/blog` страниците.
- Не сменяме pricing модела или CTA текста на subscription страниците.
- Не пипаме backend / Edge functions.
- Не добавяме Motion library или GSAP — постигаме всичко с CSS + малък rAF JS.

## Risk & rollback

- Премахването на `TopDocuments` и `BlogRotator` от homepage е visible regression — ако SEO/CTR падне, връщаме ги с един commit (компонентите остават в repo-то, само се reimport-ват в `Index.tsx`).
- ⌘K shortcut може да конфликтира с браузърни bookmarks shortcuts на някои OS — добавяме fallback на `Ctrl+/`.