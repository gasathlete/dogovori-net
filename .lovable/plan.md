## Цел
Подготовка на мобилната версия за рекламна кампания: премахване на застъпвания, лош спейсинг и грешни навигационни линкове.

## Установени проблеми (от бърз обход 390×844)

1. **Навигация — счупени hash-линкове в хедъра**
   `NAV` сочи към `/#sectors` и `/#compliance`. Тези секции съществуват само на `/` (Index). Когато сме на друга страница (напр. `/catalog`, `/build`), кликът върху "Сектори" / "Съответствие" просто променя URL хеша и не отвежда никъде. Трябва принудителна навигация към `/` + scroll до секцията.

2. **Cookie banner застъпва съдържанието**
   Banner-ът е `fixed bottom-3 left-3` и на mobile покрива долната половина на hero бутоните + последните карти на каталога. Трябва: на mobile да е full-width в дъното, по-компактен (един ред CTA), със safe-area padding.

3. **Каталог — хоризонтален scroll на категорийни pill-ове**
   Втората категория ("02 Интелектуална собственост") е орязана и няма визуален индикатор за scroll. Добавяне на fade mask вдясно + по-добър wrap/overflow indicator.

4. **Логото на хедъра изглежда празно на някои страници**
   На `/build`, `/account` иконата вътре в златния квадрат не се рендира (само цветен правоъгълник). Вероятно lazy load / грешен път в `Logo` при `compact` режим. Трябва да се провери `src/components/Logo.tsx` и да се гарантира eager fallback.

5. **Sticky header + sticky CTA-та**
   Проверка дали на дълги страници (Wizard, BuildContract, Account) sticky хедърът + евентуални долни ленти не оставят твърде малко viewport.

6. **Tap targets под 44px**
   Header има `h-9` бутони (36px) — под препоръчителните 44px. На mobile да се уголемят до `min-h-11`.

7. **Hero буфер и spacing на mobile**
   Подзаглавието в Hero е дълго; на 390px заема много вертикално място преди CTA. Преглед за по-плътен ритъм + балансиран line-height.

## Обхват на одита

Ще обхвана следните mobile pages при 390×844 (iPhone 12/13/14):
- `/` (Index — Hero, Sectors, TopDocuments, Process, Compliance, Footer)
- `/catalog`
- `/sektor/:id` и `/category/:id`
- `/wizard/:id` (стъпки + LiveDraft)
- `/build`
- `/auth`, `/account`
- `/blog`, `/blog/:slug`
- `/terms`, `/privacy`, `/cookies`, `/refund`, `/contacts`
- `/team`

За всяка: screenshot → списък с overflow / overlap / clipping / tap target / навигационни линкове.

## Промени в кода

- **`src/components/Header.tsx`** — заменя `Link` за hash елементите със `useNavigate` + `scrollToHash`, така че `/#sectors` винаги да отвежда до Index #sectors. Вдига височина на бутоните до `h-11` на mobile.
- **`src/components/CookieBanner.tsx`** — на mobile: `inset-x-3 bottom-3` (full width), еднороден ред с компактни бутони, `pb-[env(safe-area-inset-bottom)]`.
- **`src/components/Logo.tsx`** — проверка че `compact` варианта има валиден `src` и `loading="eager"`; fallback на текстов logo ако image fails.
- **`src/pages/Catalog.tsx`** — добавяне на gradient fade-mask вдясно на категорийната scroll лента + `scroll-snap-x` за по-добра usability.
- Локални spacing fixes по страница според намереното (padding, gap, line-height на mobile breakpoints).

## Технически детайли

- Hash navigation: ползваме съществуващия `scrollToHash` хелпер от `src/lib/scrollToHash.ts` плюс `navigate("/", { state: { scrollTo: id } })`, или директна проверка `if (location.pathname !== "/") navigate("/" + hash)`.
- Безопасни tokens: всички промени остават в design tokens (gold, navy, muted-foreground); никакви hard-coded цветове.
- Без промени в business logic, бекенд, edge functions или БД.

## Verification

След всеки fix: повторен screenshot на засегнатата страница в 390×844 и в 320×568 (минимален таргет), кратко резюме какво е оправено.
