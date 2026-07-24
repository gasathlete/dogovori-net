# Плавна визуална връзка около hero видеото

Целта е видеото в Hero да не се усеща като отделен блок, а като естествено начало на страницата — със същата цветова палитра, същите шрифтове и меки преходи към следващите секции. Всичко остава четимо и „леко".

## 1) Hero — по-мека наслойка над видеото
Файл: `src/components/HeroVideoBackdrop.tsx`

- Заменям силния тъмен градиент (`from-navy/75 via-navy/55 to-navy/85`) с двуслойна композиция в тона на сайта:
  - основен слой: `bg-gradient-to-b from-background/85 via-background/60 to-background` — така долният край на видеото се „стапя" в цвета на следващата секция;
  - топъл акцент: много лек `gold/8%` радиален highlight в горната третина, за да свърже видеото със златистите UI акценти (chip-ове, ъглови орнаменти, CTA);
  - винетка сваля от 40% на ~25%, за да остане усещането „леко".
- Добавям тънка долна пелена (SVG или градиент маска) с височина ~72px, която прелива от прозрачно към `hsl(var(--background))`, за да няма ръб между видео секцията и `PlatformCapabilities`.

## 2) Hero съдържание — шрифтова и цветова хармония
Файл: `src/components/Hero.tsx`

- H1 остава `font-serif`, но заглавието получава лек `text-shadow` (`0 1px 0 hsl(var(--background)/0.4)`) само върху видео фона, за да е ясно четимо без да натежава.
- Eyebrow chips, промо реда и process chips минават на **единна типографска стълбица**: eyebrow/uppercase 10–11px `tracking-[0.18em]`, body 13–14px, всичко в `text-foreground/80` или `text-muted-foreground` — премахваме смесицата от `text-gold`, `text-muted-foreground` и `text-gold/90` в един ред.
- Process chips (Договаряй · Създай · Прецизирай · Подпиши): държим `border-gold/30` и `text-gold/90`, но hover-ът става по-мек (`hover:bg-gold/10` вместо `/15`) и без вертикално преместване — само лек `ring` при focus, за да не подскачат.
- Единствен primary CTA („Започни безплатно" / трите tile-а за логнати) запазва златистия accent — той е фокусната точка на секцията, останалото се държи по-неутрално.

## 3) Преход Hero → следваща секция
Файл: `src/pages/Index.tsx`, `src/components/PlatformCapabilities.tsx` (визуално)

- Премахвам `border-b` от Hero секцията — преходът се поема от градиентния fade в точка 1.
- `PlatformCapabilities` получава фонов градиент `bg-gradient-to-b from-background to-card/40`, така секцията започва в същия тон, в който Hero завършва.
- Между Hero и `PlatformCapabilities` не слагаме `Divider` — първата „хартиена" линия се появява едва преди `PainSolution`.

## 4) Общи tokens за „плавност"
Файл: `src/index.css`

- Добавям една utility клас `.section-soft-top` (маска-градиент 64–80px от прозрачно към `background`) — reusable за секции, които идват след visual-heavy блок (Hero, PlatformShowcase).
- Добавям CSS променлива `--hero-veil` и я използвам в `HeroVideoBackdrop`, за да може бъдещо ъпдейт на тона на видеото да се прави от едно място.
- Уеднаквявам `--radius` използване в chip-овете (`rounded-full` за process, `rounded-md` за action tiles) — вече е така, само документираме.

## 5) Достъпност и производителност
- Overlay-ите пазят контраст ≥ 4.5:1 върху текст (проверка след смяната на градиента; при нужда се вдига `background/60` → `/70` в средния слой).
- `prefers-reduced-motion` fallback вече показва poster — новите overlay-и работят и над него.
- Никакви нови DOM възли извън `HeroVideoBackdrop` (без нов JS) — промените са само CSS/tokens.

## Технически детайли
- Промени в 4 файла: `HeroVideoBackdrop.tsx`, `Hero.tsx`, `PlatformCapabilities.tsx`, `index.css`. `Index.tsx` — само махане на един `Divider`, ако присъства между Hero и PlatformCapabilities.
- Няма промени в бекенд, роутинг, бизнес логика или compilation surface.
- Верификация: `tsgo` typecheck + бърза Playwright снимка на `/` за визуална проверка на прехода.

## Извън обхват
- Смяна на самото видео/poster.
- Промени в Header, footer или други секции надолу по страницата.
- Нови компоненти или анимации извън изброените CSS преходи.
