
## Цел

Изостряне на съществуващия dark-navy + gold editorial стил на началната страница. Без смяна на палитра/типография. Подобрена маркетингова йерархия: доверие → скорост/AI → цена → social proof. Всички числа за каталога са **590 шаблона**.

## Промени по секции

### 1. Hero (`src/components/Hero.tsx`)
- **Trust bar над H1**: тънка лента с 3–4 микро-сигнала ("ЗЗД · ТЗ · ЗУТ съответствие", "AI анализ на риска", "590 безплатни шаблона", "Електронен подпис"). Сепаратори от gold hairline.
- **H1**: запазен текст, по-стегнат tracking, gold shimmer само на ключовата фраза.
- **Subheadline**: добавяне на ред „590 шаблона · Pro 9.90 €/месец · без скрити такси" (само EUR).
- **CTA блок**: основен „Намери документ" с лек pulse glow; вторичен „Изготви документ" — outline gold. Микро-копие под бутоните: „Без регистрация за разглеждане · 2 минути до готов документ".
- **Trust строки (3 карти отдолу)**: над label-а се добавя метрика — „590" шаблона, „<2 мин" изготвяне, „100%" GDPR/ЗЗД съответствие.
- По-фина прозрачност на фоновото лого.

### 2. SectorGrid (`src/components/SectorGrid.tsx`)
- Counter chip до H2: „12 сектора · 590 документа".
- По-изразен hover на картите (gold corner ticks като в PartnersBoard) и малък arrow icon долу-вдясно.

### 3. TopDocuments (`src/components/TopDocuments.tsx`)
- Карта №1 като „featured" вариант (gold rim, badge „Най-търсен").
- Микро-метрика под всяка карта („X хил. изтегляния" — индикативни числа през токени).
- Долу: вторичен CTA „Виж целия каталог (590 шаблона)" в `btn-ghost-gold`.

### 4. Process (`src/components/Process.tsx`)
- Визуално свързване със стрелки/hairline между картите на desktop.
- Стъпки 5–6 (Storage, Blog) се групират като „Допълнително" с по-тих фон.

### 5. PartnersBoard
- Над marquee: „Доверени от 40+ фирми в България".

### 6. ComplianceSection
- Sub-headline „Защо да ни се доверите" + 3 trust badges (ЗЗД · GDPR · eIDAS) над pillars.

### 7. Нова секция: Testimonials (между Partners и Compliance)
- `src/components/Testimonials.tsx` — 3 карти с цитати (юрист, фрийлансър, малък бизнес), stars, инициали. Lazy-loaded.

### 8. Финална CTA лента (преди SeoFooter)
- `src/components/CTABand.tsx` — full-width gold-tinted band: „Готови ли сте да изготвите своя документ?" + 2 CTA. Силен conversion момент.

### 9. `src/index.css`
- Подсилен `gold-shimmer` keyframe.
- Нови utility-та: `.metric-number` (font-serif, gold gradient за големи числа) и `.trust-chip`.

## Технически детайли
- Само semantic tokens (`gold`, `card`, `hairline`, `muted-foreground`) — без hardcoded цветове.
- Само CSS keyframes + съществуващите `anim-rise` / `Reveal`. Без нови JS зависимости.
- Новите секции се mount-ват през `LazyOnVisible` в `Index.tsx`.
- Mobile-first: всичко single-column на <640px; trust chips wrap-ват.

## Файлове

Промяна:
- `src/components/Hero.tsx`
- `src/components/SectorGrid.tsx`
- `src/components/TopDocuments.tsx`
- `src/components/Process.tsx`
- `src/components/PartnersBoard.tsx`
- `src/components/ComplianceSection.tsx`
- `src/pages/Index.tsx`
- `src/index.css`

Нови:
- `src/components/Testimonials.tsx`
- `src/components/CTABand.tsx`

## Извън обхват
- Промяна на палитра/шрифтове
- Routing или съдържание на каталога
- Backend/Supabase
- Wizard pages
