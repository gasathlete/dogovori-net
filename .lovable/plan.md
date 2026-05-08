## План: SEO оптимизация — секции 1, 4, 5

### 1. Google Search Console + Bing Webmaster
**Аз правя:**
- Добавям `<meta name="google-site-verification" content="...">` slot в `index.html` (placeholder, който да попълниш след регистрация)
- Същото за `msvalidate.01` (Bing)
- Уверявам се, че `sitemap.xml` е достъпен на `https://dogovori.net/sitemap.xml`

**Ти правиш (5 минути):**
- Регистрираш `dogovori.net` в [Google Search Console](https://search.google.com/search-console)
- Избираш "URL prefix" метод → копираш HTML meta tag → казваш ми кода → го слагам
- Submit на sitemap
- Същото за [Bing Webmaster Tools](https://www.bing.com/webmasters) (по избор)

### 4. Локална SEO семантика (BG)
- **`index.html`**: добавяне на `<meta name="geo.region" content="BG">`, `<meta name="geo.placename" content="Bulgaria">`, `<link rel="alternate" hreflang="bg-BG" href="https://dogovori.net/">`
- **`Index.tsx`**: добавяне на 2 нови JSON-LD блока:
  - `Organization` schema (име, лого, URL, contactPoint, sameAs със соц. профили ако има)
  - `WebSite` schema със `SearchAction` (sitelinks search box в Google) → точката към `/catalog?q={search_term_string}`
- **`Catalog.tsx`**: добавяне на `BreadcrumbList` JSON-LD (Home → Каталог)

### 5. Вътрешни линкове
- **Свързани шаблони на template page** (`Template.tsx`): след FAQ блока — секция "Свързани шаблони" с 4-6 други документа от същата категория, с линкове към техните `/shablon/:slug`
- **Категорийни hub страници** `/kategoria/:slug`:
  - Нов route + нова страница `src/pages/Category.tsx`
  - Slug на категория идва от `cat.title` (вече има slugify)
  - Показва H1 = името на категорията, кратко описание (50-80 думи AI-генерирано), grid с всички шаблони от категорията (линкове към `/shablon/:slug`)
  - SEO: title `"{Категория} — шаблони на договори | dogovori.net"`, JSON-LD `CollectionPage` + `BreadcrumbList`
  - Добавяне към `sitemap.xml` (build-sitemap.ts ще включи и тях — ~10-15 нови URL)
  - Добавяне към `prerender.ts`
- **Footer с популярни шаблони**: нов `src/components/SeoFooter.tsx` с 3 колони:
  - "Топ шаблони" (15 най-търсени, hardcoded list)
  - "Категории" (всички категории → /kategoria/:slug)
  - "Информация" (/terms, /privacy, /cookies, /refund)
  - Включен в layout-а на всяка публична страница (Index, Catalog, Template, Category)
- **Каталог UI**: при всяка категория — линк "Виж всички →" към `/kategoria/:slug`

### Файлове за промяна/създаване
**Създаване:** `src/pages/Category.tsx`, `src/components/SeoFooter.tsx`, `src/lib/categorySlugs.ts`, `src/data/categoryDescriptions.ts` (AI-генерирано)
**Редакция:** `index.html`, `src/App.tsx` (нов route), `src/pages/Index.tsx` (Organization + WebSite JSON-LD + footer), `src/pages/Catalog.tsx` (Breadcrumb JSON-LD + категорийни линкове + footer), `src/pages/Template.tsx` (related templates + footer), `scripts/build-sitemap.ts` (категорийни URL), `scripts/prerender.ts` (същото)
**Скрипт за еднократно пускане:** `scripts/generate-category-descriptions.ts` (15-20 кратки SEO описания за hub страниците чрез Lovable AI)

### Какво НЕ е тук
- Реалната GSC/Bing регистрация (твоя задача — изисква собствен Google акаунт)
- Backlinks, Google Business Profile (секции 6-7 от предишния план)
- Performance audit (секция 2)

Започвам ли?