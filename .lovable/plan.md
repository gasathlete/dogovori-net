## Какво се брои за „операция"

В момента операция = всяко извикване на `consume_quota` (или `consume_team_quota` при екипи). Това става на 4 места:

| # | Действие | Edge функция | Kind (стар модел) |
|---|---|---|---|
| 1 | Сваляне на генериран договор (PDF/DOCX) | `download-document` | `contract` |
| 2 | Сваляне на безплатна бланка | `download-blank` | `template` |
| 3 | AI правен риск-анализ на качен договор | `analyze-contract` | `analysis` |
| 4 | Съобщение към AI чат-асистента | `assistant-chat` | `analysis` |

Текущи безплатни лимити (раздробени): 3 договора + 3 бланки lifetime, после 1+1/мес; 1 анализ lifetime; чатът дели брояча на анализите. Купеният пакет „5 операции" се харчи само за договори.

---

## Нов модел: обобщени операции

**Безплатен план:** 6 операции lifetime + 2 операции/месец, валидни за всеки тип (договор, бланка, анализ). Чатът отпада от броячa.

**Бонус пакет (закупени операции):** работи обобщено за всички типове (договор, бланка, анализ), не само договори.

**Предприемач / Екип:** без промяна — продължават с 100 операции/мес общо.

**Миграция:** съществуващите потребители получават сумирани използвани операции (`contracts_used + templates_used + analyses_used`) като начален брояч.

---

## Технически промени

### 1. Миграция на схемата (`download_quota`)
- Добави колона `total_used INTEGER NOT NULL DEFAULT 0` (lifetime брояч на всички операции).
- Добави колона `monthly_total_used INTEGER NOT NULL DEFAULT 0`.
- Backfill: `UPDATE download_quota SET total_used = contracts_used + templates_used + analyses_used, monthly_total_used = monthly_contracts_used + monthly_templates_used`.
- Старите колони (`contracts_used`, `templates_used`, `analyses_used`, `monthly_*_used`) остават — продължават да се пълнят за статистика по тип (карти „Свалени договори" / „Свалени бланки" в таблото).

### 2. Презапис на `consume_quota(_kind text)`
Нова логика за free path:
```
FREE_LIFETIME = 6
FREE_MONTHLY  = 2

if not pro:
  roll monthly window if 30+ days
  if total_used < 6        → +1, ok
  elif monthly_total_used < 2 → +1, ok
  elif bonus_contracts > 0  → -1 bonus, used_bonus=true, ok (за ВСЕКИ kind, не само contract)
  else → quota_exceeded
```
По същия начин обновява и съответния per-kind брояч за статистика.

Pro path остава непроменен (100/мес).

### 3. Извади чата от операциите
В `supabase/functions/assistant-chat/index.ts` премахни извикването на `consume_quota`/`consume_team_quota`. Запази rate-limiting на чата ако трябва (отделно от операциите) — например проста защита срещу спам на ниво минута.

### 4. UI промени (`src/pages/Account.tsx`)
- Карта „План" sub: `"6 безплатни, после 2/мес"` (вместо „3+3 безплатни, после 1+1/мес").
- Карти „Свалени договори" и „Свалени бланки" остават като статистика (без `/3` суфикса за free — той вече няма смисъл при общ лимит).
- Добави нова карта или промени съществуващата „План": покажи `total_used / 6` lifetime + `monthly_total_used / 2` за месеца.
- В SubscriptionTab: текстът „Безплатно: 3 договора + 3 бланки…" → „Безплатно: 6 операции общо, после 2/месец. Използвани: X от 6."
- Features списък на Предприемач план: премахни „До 100 операции на месец" разделено — формулирай го като 100 операции (договори + бланки + анализи).
- Премахни препратките за чата като операция в копи текста.

### 5. Refund функция
`refund_quota(_user_id, _kind, _used_bonus)` — добави намаляване и на `total_used`/`monthly_total_used` симетрично с консумацията.

### 6. Edge функции с `consume_quota`
Кодът в `download-document`, `download-blank`, `analyze-contract` не се променя — продължава да подава `_kind`, но новата RPC ще решава по обобщения брояч. Само премахваме извикването от `assistant-chat`.

### 7. Системен промпт на асистента
В `assistant-chat/index.ts` ред 41: обнови описанието на лимитите → „Безплатен план = 6 операции общо + 2/месец (договори, бланки, анализи); Предприемач = 100 операции/месец; Екип = места × 100/месец. Чатът е безплатен."

---

## Файлове за промяна

- `supabase/migrations/<нова>.sql` — нова колона + backfill + презапис на `consume_quota` и `refund_quota`.
- `supabase/functions/assistant-chat/index.ts` — премахни consume_quota; обнови системния промпт.
- `src/pages/Account.tsx` — копи и брояч на таблото и SubscriptionTab.
- `src/integrations/supabase/types.ts` — авто-генериран след миграцията.

Нищо не пипаме в чекаут логиката, цени, или Stripe — само начина на броене.
