# План: Пълно B2B разширение на /team

Заявката е голяма (10 направления, всяко с DB + UI + edge функции). За да се запази качеството, разделям я на **5 етапа**, които ще изпълнявам последователно в отделни съобщения. Всеки етап завършва с работеща, тествана функционалност преди да преминем към следващия.

## Етап 1 — Брандинг и фирмени контакти (CRM)
- **Branding tab** в /team: качване на лого (storage `partner-logos` или нов `team-logos`), brand color picker, фирмен подпис, "blank pages" PDF header с лого/ЕИК/адрес
- Колони `teams`: `logo_url`, `brand_color`, `signature_data_url`, `letterhead_enabled` (вече има част)
- Прилагане на лого/цвят при export на договори създадени в team контекст
- **Споделени контакти**: добавяне на `team_id` в `contacts` + RLS, UI таб "Контакти на фирмата"
- Edge function `lookup-eik` — справка по ЕИК през публичен API на ТР (papagal.bg / opendata)
- CSV/Excel импорт на контакти

## Етап 2 — Регистри и напомняния
- Нова таблица `company_registers` (тип: outgoing_contracts | gdpr | nda | other) + `register_entries`
- UI: таб "Регистри" с автоматично попълване от подписани договори
- Поле `expires_at` в `saved_documents` / `uploaded_contracts` + `reminder_sent_at`
- Cron edge function `check-expiring-documents` (дневно), email чрез съществуващата email инфраструктура
- ЗЗЛД регистър — генериране на стандартни записи (обработващи дейности)

## Етап 3 — Workflow, одобрения и шаблонна библиотека
- Колона `status` в `saved_documents`: draft | review | approved | signed | cancelled
- Таблица `document_approvals` (document_id, approver_id, status, comment)
- UI: status badges, бутон "Изпрати за одобрение", изглед "За одобрение от мен"
- Таблица `team_templates` — заключени клаузи (locked_clauses jsonb), only admin може да редактира
- Members могат да създават договори от team templates без да променят защитените клаузи

## Етап 4 — КЕП интеграция и двуезични договори
- Edge function `kep-sign` с Evrotrust REST API (sandbox първо) — ще поискам API ключ
- UI бутон "Подпиши с КЕП" в DocumentViewer (само за team плащащи)
- Двуезични договори: разширение на AI prompt да генерира EN версия, side-by-side viewer
- BG/EN toggle в export

## Етап 5 — Audit, 2FA, секторни пакети, SSO
- Разширен audit log viewer в /team (вече има `team_audit_log` table) с филтри
- 2FA enforcement за admin: setting `require_2fa` в teams, проверка при login
- Секторни пакети: при създаване на team — избор "Адвокатска кантора / Счетоводна / Брокер / Строителна", което преподписва default folders + templates + регистри
- SSO: Google Workspace домейн whitelist (auto-join по email домейн), SCIM endpoint (basic)

---

## Какво ще започна СЕГА (този отговор = Етап 1)

1. Migration: добавяне на `team_id` колона в `contacts` + RLS update; полета `letterhead_enabled` в `teams`
2. Storage bucket `team-assets` (private) за лога и подписи
3. Нов таб система в `/team`: "Общи", "Документи", "Контакти", "Брандинг", "Членове" (текущото съдържание се пренарежда)
4. `TeamBranding.tsx` — upload лого, color picker, фирмен подпис, превю на letterhead
5. `TeamContacts.tsx` — list/create/edit споделени контакти + ЕИК справка (mock първо, реален API в следващ етап ако имате достъп)
6. CSV import на контакти

## Технически детайли
- RLS промени за `contacts`: `(auth.uid() = user_id OR (team_id IS NOT NULL AND is_team_member(auth.uid(), team_id)))` — по същия модел като `saved_documents`
- `lookup-eik`: ще използвам безплатен публичен endpoint; ако няма — ще оставя placeholder с ясно съобщение
- Letterhead PDF: разширение на съществуващия export pipeline да чете team branding

## Потвърждение
Започвам с Етап 1 веднага след одобрение. Етапи 2-5 ще ги пускам в отделни съобщения, за да можете да тествате между тях. Ако предпочитате друга последователност или искате да прескочим някой етап (напр. КЕП ако нямате API), кажете.
