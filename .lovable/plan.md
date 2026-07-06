## Контекст на плана

Отговори от предишни въпроси:
- **Фокус:** Landing → Регистрация + Free → Pro конверсия
- **Данни:** реални funnel метрики (30 дни, вече извлечени)
- **Обхват:** Copy + нови компоненти
- **Toast спецификация:** маскирани имейли, ротация 60-90-50-30-60-20 сек

## Ключови находки от кода (какво вече е налично)

- `funnel_events` таблица + DB запис в `trackFunnelEvent` — работи, RLS позволява anon insert
- `ExitIntentLeadMagnet` (email за PDF) — съществува и е mount-нат в `Index`
- `RoiCalculator` — съществува и е на `/plans`
- Hero micro-line „Без карта · 10 безплатни · GDPR" — вече е там
- Plans page има `highlight` badge (Предприемач маркиран)
- `SocialProofToast` — mount-нат (но със стар формат — трябва пренапис)

Затова планът се фокусира върху това, което **липсва или не отговаря** на спецификацията.

---

## Промени

### 1. `SocialProofToast` — пренапис по спецификация
- POOL ~14 маскирани имейла: `Kal********@gmail.com`, `iva********@abv.bg`, `geo********@mail.bg`, `Mar********@gmail.com`, `sto********@abv.bg`, `Nik********@yahoo.com`, `vic********@gmail.com`, `Ele********@outlook.com`, `dim********@abv.bg`, `pet********@gmail.com`, `ste********@mail.bg`, `ale********@gmail.com`, `yan********@abv.bg`, `Bor********@yahoo.com`
- Формат: „потребител **Kal********@gmail.com** \n изтегли Договор за наем"
- Действия: изтегли/генерира/анализира/подписа/започна trial + разнообразни документи (Договор за наем, NDA, Трудов договор, Граждански договор, Договор за услуга, Пълномощно, Договор за заем и др.)
- Ротация: рекурсивен `setTimeout` със стъпков индекс в масив `[60, 90, 50, 30, 60, 20]` секунди — след последния се завърта отначало
- Първа поява след 60s (не 8s)
- Round-robin върху POOL, dismiss per sessionStorage, cleanup при unmount
- Скрива се ако `lead_magnet_shown_v1` е активен (за да не се струпват UI елементи)

### 2. `StickyScrollCta` — auto-hide при видим CTABand
- IntersectionObserver върху `#cta-band` секцията: когато е ≥30% видима → sticky се крие
- Добавям `id="cta-band"` в `CTABand.tsx`
- Избягва двоен CTA в долния край

### 3. `useFunnelCta` — по-меко trial teasing на границата на quota-та
- При **stage 2** (opsUsed = cap−1) subLabel става: „Остава 1 безплатна · Активирай 7-дневен trial"
- Действието остава същото — само по-агресивен pull към plans без блокиране
- Не пипам pricing или quota консумация

### 4. Verify + документиране
- Бърза проверка че `funnel_events` получава записи след промените (Playwright не е нужно — вече потвърдено от RLS + insert код)

---

## Файлове

**Пренаписвам:**
- `src/components/funnel/SocialProofToast.tsx`

**Малки редакции:**
- `src/components/funnel/StickyScrollCta.tsx` (IntersectionObserver auto-hide, ~10 реда)
- `src/components/CTABand.tsx` (`id="cta-band"` на root section)
- `src/hooks/useFunnelCta.ts` (subLabel при stage 2)

**Не пипам** (вече покриват съответната част от разширения план): Hero, ExitIntentLeadMagnet, RoiCalculator, Plans, CheckoutReturn, funnel.ts.

## Очакван ефект

- Toast чувствително по-малко досаден (60s първо появяване вместо 8s, дълги паузи между)
- По-персонализирано социално доказателство (реални-изглеждащи имейли вместо имена+градове)
- Sticky CTA и CTABand не се припокриват
- Free users на предпоследната операция виждат ясен път към trial

Одобри — минавам в build mode и изпълнявам с паралелни tool calls.