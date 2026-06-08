# 25 маркетинг изображения за Zeely

Ще създам 25 PNG asseta, готови за импорт в Zeely. Стилът следва сайта — navy фон (#0F172A), gold акценти (#C5A35A), serif заглавия. Запазват се в `/mnt/documents/zeely/` и се отдават като `<presentation-artifact>` за сваляне.

## Технически параметри
- **15 вертикални**: 1080×1920 (9:16) — Stories / Reels / TikTok
- **10 квадратни**: 1080×1080 (1:1) — Feed posts
- Формат: PNG, ~150–300 KB всеки
- Тип: реални скрийншоти от сайта, поставени в device mockup рамки (телефон за 9:16, лаптоп за 1:1), върху navy + soft gold радиален градиент с фини декорации (мрежа, sparkles).

## Източник на скрийншотите
За реалните страници ще използвам `browser--view_preview` + `browser--screenshot` на:
1. `/` — Hero
2. `/` — FeaturedBlanks секция
3. `/` — LifeScenarios секция
4. `/catalog` — каталог с филтри
5. `/komplekti` — пакети
6. `/build` — AI Build страница
7. `/sektor/real-estate` — секторна страница
8. `/blog` — блог листинг
9. `/wizard/...` (примерен шаблон в работа)
10. `/tools` — калкулатори
11. `/account` — pricing/subscription таб (Предприемач 12.90 € / Екип 10.90 €)
12. Шаблонна страница `/shablon/dogovor-za-naem-...`

И двата viewport-а: телефон (393×852) за 9:16 и desktop (1440×900) за 1:1.

## Композиция (Python + Pillow)
Скрипт в `/tmp/zeely_assets.py` който:
1. Зарежда скрийншот
2. Прави iPhone-style рамка (rounded 48px corners, тънък gold ring, drop shadow) за вертикали; macOS browser chrome (traffic lights, тънък gold border, shadow) за квадратни
3. Поставя върху navy mesh градиент (HSL token парадигма от сайта)
4. Добавя hook текст отгоре или отдолу — serif heading + sans body, gold accent дума
5. Долу: малък „dogovori.net" wordmark + gold dot

Шрифтове: Playfair Display (serif) + Inter (sans) — сваляне от Google Fonts при изпълнение.

## 25-те asset-а — съдържание

**Вертикални 9:16 (15 бр.) — hook + screenshot:**

| # | Hook (BG) | Скрийншот |
|---|-----------|-----------|
| 1 | „Договор за наем за 3 минути" | Hero |
| 2 | „600+ готови образци" | Catalog |
| 3 | „AI правен асистент" | Build |
| 4 | „Подпиши електронно" | Wizard signature step |
| 5 | „Риск-анализ на всеки договор" | RiskReport панел |
| 6 | „Безплатно. Без регистрация." | Featured blanks |
| 7 | „Молба за напускане — свали за 30 сек" | Шаблон |
| 8 | „Купуваш или продаваш имот?" | LifeScenarios |
| 9 | „NDA, GDPR, DPA — готови" | Сектор Digital |
| 10 | „Трудов договор по чл. 67 КТ" | Сектор Employment |
| 11 | „Експорт в PDF и DOCX" | Wizard preview |
| 12 | „Калкулатор за обезщетение" | Tools |
| 13 | „Пакети документи за всяка сделка" | Komplekti |
| 14 | „FIRST100 → −30% за първите 100" | Pricing |
| 15 | „Архитект на твоите сделки" | Hero (alt crop) |

**Квадратни 1:1 (10 бр.) — социален feed:**

| # | Hook | Скрийншот |
|---|------|-----------|
| 16 | „600+ договори. Един адрес." | Catalog grid |
| 17 | „Запис на заповед — образец" | Шаблон |
| 18 | „Развод без хаос" | Сектор Family |
| 19 | „Пълномощно за 2 минути" | LifeScenarios |
| 20 | „Стартираш ООД?" | Сектор Corporate |
| 21 | „Блог: GDPR за малки фирми" | Blog post |
| 22 | „Сравни два договора" | CompareTemplates |
| 23 | „Подпис с правна сила (ЗЕЕДЕП)" | Signing envelope |
| 24 | „Предприемач — 12.90 €/месец" | Pricing card |
| 25 | „Изгради собствен договор с AI" | Build |

## Изпълнение (build mode)
1. Стартирам preview със Playwright/`browser--view_preview` за всеки маршрут, правя screenshot, запазвам в `/tmp/shots/`.
2. Сваля Playfair Display + Inter в `/tmp/fonts/`.
3. Изпълнявам `/tmp/zeely_assets.py` → 25 PNG в `/mnt/documents/zeely/`.
4. QA: отварям всеки PNG, проверявам отсичане на текст, контраст, центриране. Корекции при нужда.
5. Опаковам в `/mnt/documents/zeely-bundle.zip`.
6. Доставям като `<presentation-artifact>` тагове — индивидуални файлове + zip.

## Извън обхвата
- Видеа (Reels motion) — само статични PNG. Ако искате motion версии, мога да добавя след това с `videogen`.
- Промени по самия сайт — никакви code edits.

## Време/обем
~25 PNG, общо ~5–8 MB. Цялото изпълнение е едно build-mode минаване.
