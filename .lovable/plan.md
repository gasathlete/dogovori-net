
## Какво ще направя (без рискове)

Добавям единствен нов файл `public/_headers` за продукционния билд. Не пипам нищо друго.

### Важно решение: НЕ пипам `robots.txt`

В `public/robots.txt` GPTBot/Claude/Perplexity и др. са **умишлено блокирани** с коментар: *"Block AI training / dataset scrapers — content is original Bulgarian legal material."* Това е съзнателна защита на оригинално българско правно съдържание. iptrack показва "Блокиран" в жълто като предупреждение, но за този проект това е правилното поведение. Оставям го непроменено.

### `public/_headers` (нов файл)

- **CSP** — `default-src 'self'` + whitelist за Supabase, Stripe, Lovable CDN. Включва `'unsafe-inline'` + `'unsafe-eval'` (нужни за Vite/React runtime), за да не счупя нищо.
- **Permissions-Policy** — изключва camera/microphone/geolocation/usb и т.н.; payment разрешено за Stripe.
- **X-Frame-Options: SAMEORIGIN** — анти-clickjacking.
- **HSTS** — `max-age=31536000; includeSubDomains; preload`.
- **Cache-Control**:
  - `/assets/*`, `*.js`, `*.css`, `*.woff2` → `max-age=31536000, immutable` (Vite слага хеш в името)
  - изображения → 30 дни
  - `index.html` → `no-cache, must-revalidate` (за да не остане стара версия)

### Бележка

`_headers` се чете от Lovable hosting. Ще влезе в сила след следващото публикуване. Custom домейн `dogovori.net` минава през Lovable hosting → ще работи. Ако някоя страница се счупи от CSP, ще релаксирам конкретния директив.

Да приложа?
