## Текущо състояние (проверено)

В `index.html` вече има:
- JSON-LD: Organization, WebSite (със SearchAction), SoftwareApplication, LegalService
- canonical: `https://dogovori.net/`
- hreflang: `bg-BG`, `x-default`
- Title 55 chars, description 131 chars — в нормите

В `src/components/Seo.tsx` (react-helmet-async) на всяка страница се емитират ПАК:
- `<link rel="canonical">`
- `<link rel="alternate" hreflang="bg-BG">`, `hreflang="en">`, `hreflang="x-default">`

**Проблем:** `<link>` таговете не се дедупват от Helmet → на `/` се получават **два canonical-а** и **дублирани hreflang-и**. Това е невалидно SEO.

## Промени

### 1. `index.html` — премахни 3 реда
```html
<link rel="canonical" href="https://dogovori.net/" />
<link rel="alternate" hreflang="bg-BG" href="https://dogovori.net/" />
<link rel="alternate" hreflang="x-default" href="https://dogovori.net/" />
```
Helmet (`Seo.tsx`) ги емитира per-route коректно.

### 2. JSON-LD — оставаме както е
Структурираните данни (Organization + SoftwareApplication + WebSite + LegalService) остават статични в `index.html`. Те са sitewide и валидни за всички краулъри, вкл. non-JS (LinkedIn, Slack). Няма да дублираме през Helmet.

### 3. Title/description — без промяна
- Title: 55 chars ✓
- Description: 131 chars ✓
- `Seo.tsx` има auto-truncate като защита

### 4. og:*/twitter:* в `index.html` — оставяме
Fallback за social краулъри без JS. Helmet ги override-ва за Googlebot.

## Резултат
- 1 canonical (от Helmet, per-route)
- 3 hreflang (bg-BG, en, x-default — от Helmet)
- 4 JSON-LD блока (sitewide, от index.html)
- Без дублиране, без отрязване