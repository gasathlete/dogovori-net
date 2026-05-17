# План: разгръщане на страница Екип (`/team`)

Целта е страницата да стане завършен self-service контролен панел за корпоративния абонамент — с реални имена, управление на роли, billing достъп, безопасни мутации и мобилен UX.

---

## 1. Реални данни за членове + управление на роли

**Backend (нова edge функция `team-members`):**
- POST с `{ teamId, action }`, връща за всеки член: `user_id`, `email`, `display_name`, `avatar_url`, `role`, `joined_at`.
- Използва service role за join към `auth.users` + `profiles` (RLS на `profiles` е own-only, затова не става от клиента).
- Server-side проверка че извикващият е `is_team_member`.
- Sub-actions в същата функция (или отделни функции — виж секция 3):
  - `change-role` — owner може да прави admin↔member; admin не може да променя owner.
  - `leave` — всеки нечлен-owner може да напусне; owner трябва първо да transfer ownership.
  - `transfer-ownership` — само owner, изисква второ потвърждение (текстово въвеждане на името на екипа).

**Frontend:**
- Член реда показва avatar (shadcn `Avatar`), име, имейл, бадж за роля, "Вие" маркер.
- Dropdown меню на всеки ред (само за owner/admin): Промени роля, Премахни.
- Бутон "Напусни екипа" в header-а (за non-owners).
- Бутон "Прехвърли собственост" в danger zone в края на табa Members (само owner).

## 2. Billing таб

Нов 5-ти таб "Billing" (само за owner/admin).

**Frontend:**
- Карта "Абонамент": план (Team), брой места × цена, период, дата на подновяване, статус бадж (`active`/`past_due`/`canceled`/`pending`).
- Бутон "Управление в Stripe" → отваря `customer-portal` сесия в нов tab (вече има функция, нужна е малка адаптация да приема `teamId` и да чете `teams.stripe_customer_id` вместо `subscriptions`).
- Списък с последните 10 фактури (нова edge `team-billing-data` или разширение на `get-stripe-data` с `scope: 'team'`): дата, сума, статус, линкове към hosted invoice + PDF.
- Banner при `past_due` (предупредително) и при `canceled` с `current_period_end` в бъдещето (информативно).
- "Отмени абонамент" → препраща към customer portal (там Stripe има готов UX).

**Backend:**
- Нова `team-billing-data` функция: верифицира admin, чете `teams.stripe_customer_id` + `stripe_subscription_id`, връща subscription details + invoices list (същия pattern като `get-stripe-data`).
- `customer-portal` приема `teamId` параметър; ако е подаден, ползва team customer вместо user.

## 3. Безопасни мутации + подобрени покани

**Премахни client-side `.delete()` от `team_members`:**
- Нова edge функция `team-remove-member`: проверка admin, премахва ред, записва в `team_audit_log`, изпраща имейл (template `team-removal`), не докосва Stripe seats (остават до следващия `team-update-seats`).
- UI бутонът "Премахни" вика тази функция.

**Покани (`team_invitations`):**
- Нова `team-cancel-invitation` функция → маркира с `expires_at = now()` или изтрива; admin only.
- Нова `team-resend-invitation` функция → презаписва `expires_at`, праща нов имейл с нов token.
- UI: всяка чакаща покана получава два бутона (Изпрати отново / Отмени) с потвърждение.

**Accept preview страница (`/team/accept`):**
- Преди да извика функцията, прави read-only заявка `team-invitation-info` (нова edge функция с публичен достъп по token, връща team_name, inviter display_name, expires_at).
- Показва карта: "Поканен сте в екип X от Y. До дата Z." + бутони "Приеми" / "Откажи".
- "Приеми" вика съществуващата `team-accept-invite`; "Откажи" вика `team-cancel-invitation` като поканеният.

## 4. Mobile/UX полиране + audit log

**Tabs за mobile:**
- Под `sm`: `TabsList` става `grid-cols-2` на 2 реда (или horizontal scroll). 5 таба × 2 реда е приемливо.
- Тестване на 393px.

**Skeleton/empty states:**
- Заменяме единствения spinner с targeted skeletons за header + tabs.
- Всеки таб получава своя empty state с илюстрация (Lucide icon) + кратък explainer + primary action.

**Audit log:**
- Server-side: `team-members` edge функцията се разширява с `audit-list` action — връща и actor display_name + target display_name (когато `target_type='user'`), за да не показваме UUID-та.
- Mapping на `action` ключове към четим български текст: `member.invited`, `member.joined`, `member.removed`, `member.role_changed`, `seats.updated`, `branding.updated`, `team.created` и т.н.
- Pagination: 20 на страница, бутон "Покажи още".
- Филтър по action type (dropdown).

---

## Технически детайли

```text
Edge functions (нови):
- team-members             (POST: list | change-role | leave | transfer-ownership | audit-list)
- team-remove-member       (POST: { teamId, userId })
- team-billing-data        (POST: { teamId, environment } → subscription + invoices)
- team-cancel-invitation   (POST: { invitationId })
- team-resend-invitation   (POST: { invitationId })
- team-invitation-info     (POST: { token } — публичен, без auth)

Edge functions (промени):
- customer-portal          → приема optional teamId, ползва teams.stripe_customer_id

Frontend (нови/променени файлове):
- src/pages/Team.tsx              (нов Billing таб, mobile tabs, skeleton)
- src/pages/TeamAccept.tsx        (preview UI преди приемане)
- src/components/TeamMembers.tsx  (нов — извлечен от Team.tsx, dropdown actions, avatars)
- src/components/TeamBilling.tsx  (нов)
- src/components/TeamAuditLog.tsx (нов — pagination + filter + readable actions)
- src/components/TeamInvitations.tsx (нов — resend/cancel бутони)

База данни (без миграции):
- няма нови таблици/колони — съществуващите team_audit_log + teams.stripe_customer_id са достатъчни.
```

**Поредност на изпълнение:**
1. `team-members` + `TeamMembers` компонент (най-голяма видима стойност)
2. Безопасно премахване + покани (resend/cancel/accept preview)
3. Billing функция + таб
4. Mobile полиране + audit log преработка

---

## Какво НЕ влиза в обхвата

- Промяна на pricing модела / Stripe products
- SSO/SCIM provisioning
- Granular permissions (read-only role и др.)
- Множествени едновременни екипи за един потребител
- Промени в `TeamDocuments`/`TeamContacts`/`TeamBranding` (вече работят)
