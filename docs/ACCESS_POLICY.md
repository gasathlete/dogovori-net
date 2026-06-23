# Privileged Access Policy — Dogovori.net

**Версия:** 2026-09-01  •  **Owner:** DPO / Security Lead  •  **Преглед:** на 6 месеца

## 1. Обхват
Политиката покрива всички привилегировани достъпи до:
- Lovable Cloud / Supabase (database, edge functions, storage, auth);
- Stripe (live + sandbox);
- Domain & DNS (Cloudflare);
- AI Gateway (LOVABLE_API_KEY);
- Production логове и audit таблиците (`ai_audit_log`, `audit_log`, `team_audit_log`, `signing_audit_events`, `restricted_processing_events`).

## 2. Принципи
- **Least privilege** — роли се дават само на нужните хора и само за нужната задача.
- **Need-to-know** — достъп до production data само при инцидент или одобрено разследване.
- **Separation of duties** — лицето, което одобрява достъп, не е същото, което го получава.
- **No shared accounts** — всички достъпи са персонални; service accounts се ползват само от системи, не от хора.

## 3. Роли и разрешения
| Роля | Достъп | Кой |
|---|---|---|
| Owner | Пълни права (billing, secrets, deploy) | 1 лице |
| Admin (`is_staff`) | Production database read/write, edge function deploy | ≤ 2 лица |
| Support | Read-only през admin UI (`is_staff`) с маскирани PII | По заявка |
| DPO | Read-only към audit логове, `restricted_processing_events`, `order_snapshots` | 1 лице |
| Developer | Само sandbox / preview environments | По договор |

## 4. MFA задължителна
- Всички admin / staff акаунти трябва да имат MFA (TOTP или WebAuthn).
- `AdminMFAGuard` блокира всеки admin рут, ако MFA не е активна.
- Recovery кодове се генерират при първи логин и се съхраняват в личен password manager.

## 5. Преглед на достъпа (Access Review)
- **На всеки 90 дни:** Owner + DPO правят преглед на:
  - списък на потребители с `is_staff` / admin role в `user_roles`;
  - активни секрети в Lovable / Supabase;
  - Stripe team членове;
  - GitHub collaborators.
- Резултатът се записва в `compliance_items` като evidence (`access_review_YYYY-Q#`).
- Премахване на достъп при напускане → в рамките на 24 часа.

## 6. Управление на секрети
- Всички API keys се пазят в Lovable secrets (`LOVABLE_API_KEY`, `STRIPE_*`, `RESEND_API_KEY`, …) — никога в кода, .env или Git.
- Ротация:
  - Stripe live keys — на 12 месеца или при подозрение за компрометиране;
  - `LOVABLE_API_KEY` — при подозрение за компрометиране;
  - Supabase service role key — при ротация на API keys.
- Всяка ротация се документира в `compliance_items` (control `KEY_ROTATION`).

## 7. Логване и наблюдение
- Всеки admin action в платформата се пише в `audit_log` (`actor_id`, `action`, `target`).
- Достъпите до Supabase Studio / SQL editor се логват от Supabase (project audit log).
- DPO преглежда `ai_audit_log` и `restricted_processing_events` на месечна база.

## 8. Реакция при инцидент
- При съмнение за компрометиране → незабавно блокиране на акаунта, ротация на секретите, форензичен преглед на `audit_log`.
- Срокове по чл. 33 GDPR — уведомление на КЗЛД до 72 часа.
- Пълна процедура: вж. `/legal/incident-response`.

## 9. Документация и обучение
- Всички staff минават онбординг с прочит на тази политика и `/legal/incident-response`.
- Записва се evidence (`compliance_items.control = "STAFF_TRAINING"`).
