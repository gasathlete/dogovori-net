## Цел
Преструктуриране на ценовия модел: ясни лимити за Pro, по-щедър Free tier с месечно подновяване, и нов Team план за B2B (адвокатски кантори, малки фирми).

## 1. Икономика — обосновка на числата

След оптимизациите cost per AI операция е ~$0.001 (gemini-2.5-flash-lite + кеш).

| План | Цена | Макс cost/user/мес | Margin |
|---|---|---|---|
| Free | 0€ | ~$0.006 (6 ops) | загуба, lead-gen |
| Pro месечно | 9.90€ | ~$0.10 (100 ops) | ~99% |
| Pro годишно | 99€/год (8.25€/мес) | ~$0.10 | ~99% |
| Team | 7.90€/seat × 3 = 23.70€/мес мин. | ~$0.30 (3×100) | ~98% |

100/месец покрива 99% от соло юристи (реален median ~30-40 договора/мес).

## 2. Free tier — 3+3 lifetime + 1+1/месец

**Поведение:**
- Нов user: 3 договора + 3 бланки (lifetime bonus) — стимул за регистрация и onboarding.
- След изчерпване: 1 договор + 1 бланка на всеки 30 дни (rolling window).
- Анализи остават по сегашната логика (1 lifetime, после quota_exceeded).

**Технически:**
- Промяна в `consume_quota` RPC: добавя проверка за `monthly_reset_at` колона.
- Нови колони в `download_quota`: `monthly_contracts_used INT DEFAULT 0`, `monthly_templates_used INT DEFAULT 0`, `monthly_reset_at TIMESTAMPTZ DEFAULT now()`.
- Логика: ако `now() - monthly_reset_at > 30 days` → нулирай месечните броячи и обнови `monthly_reset_at`.
- Lifetime лимити: `contracts_used < 3` или `templates_used < 3` → consume.
- След това: `monthly_contracts_used < 1` или `monthly_templates_used < 1` → consume.

**UI промени:**
- `Account.tsx`: показва "Безплатно: 3 договора + 3 бланки. След това 1+1 на месец."
- Показва оставащи месечни тегления + кога се подновяват.

## 3. Pro план — лимит 100 общо/месец

**Поведение:**
- Pro потребител: до 100 общо операции (договори + бланки + анализи) на месец.
- При достигане: soft block с upgrade до Team или wait-until-reset съобщение.
- Reset на 1-во число от месеца (или billing anchor).

**Технически:**
- Нови колони: `pro_monthly_used INT DEFAULT 0`, `pro_period_start TIMESTAMPTZ`.
- `consume_quota` RPC: ако `is_pro` и `pro_monthly_used >= 100` → връща `{ok: false, reason: 'pro_limit_reached'}`.
- Reset: сравнение `now() - pro_period_start >= 30 days` → нулиране.
- За Team users (виж по-долу): лимит 100/seat.

**UI:**
- В Account: progress bar "78/100 операции този месец".
- При 90% → toast warning.

## 4. Team план — B2B per-seat

**Структура:**
- 7.90€/seat/месец, минимум 3 seats (= 23.70€/мес базова цена).
- Годишно: 79€/seat/год (~17% отстъпка), мин. 3 seats = 237€/год.
- Лимит: 100 операции/seat/месец (т.е. 3 seats = 300/мес pooled).

**Фичъри (всички):**
- **Споделени шаблони** — папка "Team Templates", всички seats виждат и могат да use.
- **Audit log за екипа** — admin вижда action log на всички seats (action, user, document, timestamp).
- **SSO** — Google Workspace SSO (вече налично през Supabase, само enable).
- **Central billing** — един invoice, един payment method, VAT invoice с фирмени данни.
- **Branded docs** — лого на фирмата + цвят в PDF header (uploaded в Team settings).
- **Team admin dashboard** — manage seats, view usage, transfer документи между seats.

**Технически — нови таблици:**

```text
teams
  id, name, owner_id, stripe_subscription_id, seat_count,
  logo_url, brand_color, vat_data jsonb, created_at

team_members
  id, team_id, user_id, role (owner|admin|member),
  invited_at, joined_at

team_invitations
  id, team_id, email, token, invited_by, expires_at, accepted_at

team_audit_log
  id, team_id, user_id, action, target_type, target_id, metadata, created_at
```

**RLS:**
- `teams`: SELECT членове на отбора (`team_members`), UPDATE само owner/admin.
- `team_members`: SELECT всички в същия team, INSERT/DELETE owner/admin.
- `team_audit_log`: SELECT owner/admin only.
- `saved_documents` + `uploaded_contracts`: добавя `team_id` колона (nullable); SELECT policy разширена с `OR team_id IN (user's teams)`.

**Quota промени:**
- `download_quota` запазва личните лимити.
- За Team member: `consume_quota` проверява първо team pool (`teams.seat_count * 100`) преди личния free tier.
- Нова таблица `team_usage(team_id, period_start, ops_used)` за tracking.

**Stripe:**
- Нов product `team_plan` с price `team_seat_monthly` (7.90€) и `team_seat_yearly` (79€).
- Quantity-based subscription (Stripe `quantity` field = seat_count).
- Webhook update: при `customer.subscription.updated` синхронизира `teams.seat_count` и `teams.stripe_subscription_id`.

**UI — нови страници:**
- `/team` — Team dashboard (members list, invite, usage, audit log, branding).
- `/team/billing` — управление на seats и invoice история.
- В Account.tsx: ако user е в team → показва Team план info вместо Pro.
- Pricing страница: добавя 4-та колона "Team" между Pro и Enterprise.

## 5. Pricing страница (Account.tsx + landing)

Преподредба от 3 на 4 опции:

```text
[Free]              [Pro месечно]     [Pro годишно]    [Team]
0 €                 9.90 €/мес        99 €/год         7.90 €/seat/мес
3+3 lifetime        100 ops/мес       100 ops/мес      100 ops/seat
1+1 след това       Без воден знак    Spestyavate 17%  Min. 3 seats
                    Приоритетна      All Pro features SSO + Audit
                    поддръжка                          Branded docs
                                                       Споделени шаблони
```

## 6. Миграционен план за съществуващи users

- Текущи Free: получават bonus от 2 договора + 2 бланки (за да стигнат до новите 3+3 lifetime, ако вече са ползвали 1+1).
- Текущи Pro: незабавно получават 100 ops/мес лимит, period_start = `subscription.current_period_start`.
- Edge case: Pro с активен subscription, който е надхвърлил 100 в "историята" — не блокираме, започваме брояча от 0 от текущия billing period.

## 7. Файлове за промяна / създаване

**Migrations (нови):**
- `add_monthly_free_quota.sql` — нови колони в `download_quota` + актуализация на `consume_quota` RPC.
- `add_pro_monthly_limit.sql` — `pro_monthly_used`, `pro_period_start` + RPC update.
- `create_teams_tables.sql` — `teams`, `team_members`, `team_invitations`, `team_audit_log`, `team_usage` + RLS + helper функции `is_team_member(uuid, uuid)`, `is_team_admin(uuid, uuid)`.
- `add_team_id_to_documents.sql` — `team_id` в `saved_documents` и `uploaded_contracts` + разширение на RLS.

**Edge functions (нови):**
- `create-team` — създава team + Stripe subscription (quantity-based).
- `team-invite` — изпраща invitation email.
- `team-accept-invite` — приема invitation.
- `team-update-seats` — увеличава/намалява seats (sync със Stripe).

**Edge functions (промени):**
- `download-document` — проверка за team quota преди личния lifetime + branded watermark/header за Team users.
- `analyze-contract`, `generate-contract` — проверка за Pro 100/мес лимит.
- `payments-webhook` — handle `team_seat_*` price IDs, sync `teams` таблица.

**Frontend (нови):**
- `src/pages/Team.tsx`, `src/pages/TeamBilling.tsx`, `src/pages/TeamInvite.tsx`.
- `src/components/team/MembersList.tsx`, `InviteDialog.tsx`, `AuditLogTable.tsx`, `BrandingForm.tsx`.
- `src/hooks/useTeam.tsx` — current team membership, role, usage.

**Frontend (промени):**
- `src/pages/Account.tsx` — нови pricing карти, monthly usage bar, link към Team.
- `src/lib/exporters.ts` / `templateExporter.ts` — branded header за Team docs.

**Stripe products (через payments tool):**
- `team_plan` с `team_seat_monthly` (790 cents EUR) и `team_seat_yearly` (7900 cents EUR), quantity_min=3, quantity_max=100.

## 8. Какво НЕ влиза в този план
- Enterprise tier (custom pricing, dedicated support) — може по-късно.
- API достъп за Team — отделен бъдещ план.
- Bulk import/export — не е поискан.
- Промяна на цените на Pro месечно/годишно — остават 9.90€ / 99€.

## 9. Очакван ефект
- Free → Pro conversion: + ~20% (lifetime 3+3 дава време да оценят value, но лимитът е достижим).
- Нов revenue stream от Team: при 50 кантори × 3 seats × 7.90€ = ~1185€/мес допълнително.
- Cost увеличение: незначително (Team users също са capped на 100/seat).
