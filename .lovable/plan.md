
## 1. Hero — 7 кликаеми bullet точки (заменя `<p>` на ред 148-154 в `src/components/Hero.tsx`)

Дългият параграф „Индивидуални документи…" се заменя със списък от 7 кликаеми bullet карти. Всяка точка е `<Link>` към най-релевантната CTA страница.

| # | Икона (Lucide) | Текст | Линк |
|---|---|---|---|
| 1 | `ShieldCheck` | **Документи по ЗЗД, ТЗ и ЗУТ** — съобразени с актуалната българска правна рамка. | `/catalog` |
| 2 | `Bot` | **Правен AI-асистент от ново поколение** — помага ти да преговаряш най-добрите условия. | `/assistant` |
| 3 | `FileText` | **Над 600 готови шаблона** — за бизнес, имоти, труд, услуги и семейство. | `/catalog` |
| 4 | `ShieldAlert` | **Risk Analysis на чужди и собствени документи** — открива клопки, неравноправни клаузи и липсващи защити. | `/console/analysis` |
| 5 | `Languages` | **Двуезични договори** — BG / EN / DE / FR в един документ. | `/wizard-bilingual` |
| 6 | `FileSignature` | **Електронен подпис** — многостранно подписване, папки, споделяне. | `/console/signing` |
| 7 | `Package` | **Комплекти за често срещани казуси** — създай собствен комплект, използвай практично и лесно. | `/kits` |

**Layout / стил:**
- `<ul>` = `grid gap-2.5 sm:grid-cols-2 max-w-3xl mx-auto mt-6`.
- Точка 7 (Комплекти) = `sm:col-span-2` за акцент.
- Картичка: `flex items-start gap-3 rounded-lg border border-gold/15 bg-card/40 px-4 py-3 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.45)]`.
- Икона: `h-5 w-5 text-gold shrink-0 mt-0.5`.
- Етикет = **bold** в `text-foreground`; описание = `text-sm text-muted-foreground`.
- `ChevronRight` отдясно (`ml-auto opacity-0 group-hover:opacity-100`).
- Запазваме chip ред (ЗЗД / Анализ / >600 шаблона / е-Подпис) горе и микро-копи `Преговаряй · Създай · Прецизирай · Подпиши` отдолу в `text-gold/80`.
- A11y: `aria-label` на всеки линк; иконите са `aria-hidden`.

Без бизнес логика. Само презентация + routing.

---

## 2. Корекционни вълни — стъпаловидно таксуване

Сменяме „1 вълна = 1 операция" на:

```
ops = max(1, ceil(corrections_in_wave / 5))
```

| Корекции | Операции |
|---|---|
| 1–5 | 1 |
| 6–10 | 2 |
| 11–15 | 3 |
| … | `ceil(n/5)` |

**Промени:**
- Нова DB миграция: функция `charge_corrections_wave(p_user_id uuid, p_batch_id uuid, p_count int)` — изчислява ops, инкрементира `download_quota.monthly_total_used` или `pro_monthly_used` (според плана) **атомарно**, записва ред в `corrections_batch_charges` с `ops_charged`. Връща `{ ops_charged, remaining_cap, used_topup }`.
- Edge function-ите, които генерират корекции (или client кодът, който създава `batch_id`), извикват `charge_corrections_wave` с реалния брой вместо хардкоднато 1.
- UI преди приемане на вълна: ако `count > 5` показваме потвърждение „Тази вълна съдържа N корекции и ще струва X операции".
- След вълната → `useIsPro().refresh()`.

---

## 3. Top-up пакети за абонирани потребители

Старият пакет „5 операции за 1.90 €" се пенсионира. Налични **само** за активни абонати (Професионалист / Предприемач / Екип). Безплатни потребители виждат „Първо избери план".

**Нови Stripe SKU-та (one-off, EUR, ДДС 20% inclusive, `quantity_min=1, quantity_max=1`):**

| price_id | Операции | Цена | €/оп |
|---|---|---|---|
| `topup_10`  | 10  | 2.90 €  | 0.29  |
| `topup_20`  | 20  | 5.40 €  | 0.27  |
| `topup_50`  | 50  | 12.90 € | 0.258 |
| `topup_100` | 100 | 23.90 € | 0.239 |

Един продукт `topup_ops` + 4 цени през `payments--batch_create_product` (tax_code `txcd_10000000` — digital goods).

**DB:**
- Нова колона `download_quota.topup_ops_balance INT NOT NULL DEFAULT 0`.
- Нова таблица `topup_purchases (id, user_id, price_id, ops_added, amount_eur, stripe_session_id, environment, created_at)` с RLS (user вижда своите), GRANT за authenticated + service_role.
- Webhook handler за `checkout.session.completed`: ако `price_id` ∈ {topup_10…100} → инкрементира `download_quota.topup_ops_balance` с съответния брой и логва в `topup_purchases`. Идемпотентно по `stripe_session_id`.

**Логика на потребление (вкл. корекционни вълни и AI съобщения):**
1. Изчисли `ops_needed`.
2. Налично от месечен план: `cap - used`.
3. Ако `ops_needed ≤ available_plan` → инкрементирай само план брояча.
4. Иначе: попълни плана до cap, остатъкът се тегли от `topup_ops_balance` (намалявайки го).
5. Ако нито плана, нито top-up балансът стигат → блок + paywall + CTA за top-up.

**`useIsPro` връща допълнително `topupBalance: number`.**

**UI:**
- `AssistantChat` / `AssistantPaywall` / `ProUpgradeDialog`: нова секция „Добави операции" с 4 карти, hover lift + gold glow.
- Чип над лимита: `Остават X / Y от плана · +Z top-up`.
- `/account/billing` (или нов tab `/account/topups`): история на покупките от `topup_purchases`.
- Безплатен потребител в paywall: top-up картите са disabled с надпис „Налично за абонати".

---

## 4. Pricing / FAQ копи

- `src/lib/plansData.ts` — FAQ запис „Какво ако надхвърля плана?" → списък с 4-те нови пакета.
- `plan_comparison_rows` / `plan_features` (data update, не миграция): премахни „1.90 € / 5 оп.", добави нов ред „Top-up пакети 10–100 операции (само за абонати)".
- `src/pages/Plans.tsx` — нов мини-блок „Top-up за абонати" под трите плана.

---

## 5. Памет (`mem://`)

Ъпдейт на `mem://index.md` Core:
- Премахване на „one-off pack 1.90 € for 5 ops".
- Добавяне на „Top-up packs (only for active subs): 10/2.90 €, 20/5.40 €, 50/12.90 €, 100/23.90 €."
- Добавяне на „Corrections wave cost = ceil(corrections/5) ops (was flat 1)."
- Добавяне на „Hero canonical bullets = 7 items (ЗЗД, AI-асистент, 600 шаблона, Risk Analysis, двуезични, е-Подпис, Комплекти) — не добавяй/махай без съгласие."

---

## 6. Файлове, които ще се пипнат

**Frontend:**
- `src/components/Hero.tsx` — нови 7 bullet точки + import-и.
- `src/components/AssistantChat.tsx` — top-up CTA + badge за тежки вълни корекции.
- `src/components/AssistantPaywall.tsx`, `src/components/ProUpgradeDialog.tsx` — top-up секция.
- `src/hooks/useIsPro.tsx` — `topupBalance` + cap чете нови полета.
- `src/pages/Plans.tsx` — нов top-up блок.
- `src/lib/plansData.ts` — FAQ.
- (опц.) нов `src/components/TopupPacks.tsx` като share-нат компонент.

**Backend / DB:**
- Миграция 1: `download_quota.topup_ops_balance`, нова таблица `topup_purchases` + GRANT + RLS.
- Миграция 2: функция `charge_corrections_wave` + обновяване на `consume_ai_message` за теглене от top-up след cap.
- Stripe: `payments--batch_create_product` за `topup_ops` + 4 цени.
- Webhook handler (`supabase/functions/stripe-webhooks` или еквивалент) — credit на top-up + insert в `topup_purchases`.

**Памет:** `mem://index.md`.

---

### Ред на изпълнение

1. Hero bullet списък (бърза визуална победа).
2. DB миграции (топ-up колона/таблица + `charge_corrections_wave`).
3. Stripe продукти/цени.
4. Webhook handler + потребление логика.
5. UI top-up карти + paywall интеграция.
6. Pricing/FAQ + памет.
