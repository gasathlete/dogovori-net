# Общ план: имейл доставка + Google consent

## Част A — Затваряне на consent gap при Google вход

**Проблем:** От таб **Вход** бутонът „Продължи с Google" е винаги активен. Ако имейлът няма съществуващ акаунт, Google автоматично го създава, без потребителят да е приел Общи условия / Поверителност / 18+.

### A1. Нов компонент `GoogleConsentDialog`
Файл: `src/components/auth/GoogleConsentDialog.tsx`
- Reusable `Dialog` със същите 4 чекбокса като формата за регистрация (18+, Общи условия, Поверителност — задължителни; Маркетинг — опционален).
- Props: `open`, `onOpenChange`, `onConfirm(marketing: boolean)`, `busy`.
- Confirm бутонът disabled докато 3-те задължителни не са чек-нати.

### A2. Refactor на `handleGoogle` в `src/pages/Auth.tsx`
- Нов state: `googleConsentOpen`, `googleConsentBusy`.
- Wrapper `startGoogleOAuth(marketing: boolean)` — съдържа реалното извикване на `lovable.auth.signInWithOAuth(...)` и `pending_consents` записа.
- Таб **Регистрация** → директно `startGoogleOAuth(acceptMarketing)` (както сега).
- Таб **Вход** → отваря `GoogleConsentDialog`; при потвърждение → `startGoogleOAuth(marketing)`.
- Съществуващите потребители ще видят диалога еднократно при следващия Google вход (приемливо UX; pre-flight email-existence проверка не правим заради email-enumeration риска).

---

## Част B — Предупреждение за български имейл доставчици

**Файл:** `src/pages/Auth.tsx`

- Helper `isRiskyBgEmail(email)` за домейните `abv.bg`, `mail.bg`, `dir.bg` (case-insensitive).
- В таб **Регистрация**: inline жълт `Alert` под полето за имейл при рисков домейн:
  > „Българските пощи (abv.bg, mail.bg, dir.bg) често блокират имейли за потвърждение. Препоръчваме Gmail или вход с Google за по-сигурна доставка."
- В таб **Вход**: същият Alert над линка „Не получих имейл за потвърждение".
- В диалога за ръчно потвърждение (resend OTP): ако имейлът е рисков, под бутона „Изпрати код наново" се показва:
  > „Ако кодът не пристигне до 5 минути, опитайте с Google вход или друг имейл."

Без backend промени.

---

## Част C — Warm-up на `notify.dogovori.net` (стратегия, без код)

**Текущо:** Домейн е активен, SPF/DKIM/DMARC настроени от Lovable. Обем — единични имейли/ден → нулева репутация → `abv.bg` bounce.

**Поетапно (4–6 седмици):**

1. **Седмица 1–2:** 5–10 имейла/ден към „топли" Gmail/Outlook inbox-и на екипа и доверени потребители. Молба да отворят, да цъкнат линка, да маркират като „Not spam" при нужда. Без `@abv.bg` / `@mail.bg`.
2. **Седмица 3–4:** 20–50 имейла/ден. Постепенно 1–2/ден към `@abv.bg` от реални потребители. Следене на `email_send_log` за bounce/complaint rate < 2%.
3. **Седмица 5–6:** Нормален режим (100+/ден). Очаквано отваряне от `abv.bg`/`mail.bg`.

**Технически подобрения (ръчни/външни действия от потребителя):**
- Регистрация в Google Postmaster Tools и Microsoft SNDS за `dogovori.net` (виждаме reputation метрики).
- DMARC aggregate reports (`rua=mailto:dmarc@dogovori.net`) — конфигурира се през Cloud → Emails ако е достъпно; иначе ръчна стъпка.
- Suppression cleanup — само за конкретни случаи, ръчно.

**Извън scope сега:** dedicated IP, отделен subdomain за маркетинг, резервен SMTP fallback.

---

## Част D — Admin Email Monitoring Dashboard (по избор)

За да следим warm-up прогреса и проблеми, нова admin-only страница `/admin/emails`:

- **Защита:** route guard — само за потребители с роля `admin` от `user_roles`.
- **Филтри:** Time range (24h / 7d / 30d / custom), Template (multi-select), Status (All / Sent / Failed / Suppressed).
- **Stat cards:** Total / Sent / Failed / Suppressed (deduplicated по `message_id`).
- **Таблица:** Template, Recipient, Status badge, Timestamp, Error — paginated, сортирана по `created_at DESC`, deduplicated.
- **Bonus widget:** „Top failing domains last 30d" — agregirano по domain part на `recipient_email`, за warm-up мониторинг.
- Заявките използват `DISTINCT ON (message_id) ... ORDER BY message_id, created_at DESC` както изисква schema-та.

Нови файлове:
- `src/pages/admin/EmailsDashboard.tsx`
- `src/components/admin/EmailStatsCards.tsx`
- `src/components/admin/EmailLogTable.tsx`
- route добавен в `App.tsx` с admin guard.

---

## Файлове, които ще се пипнат

**Задължително (Части A + B):**
- `src/components/auth/GoogleConsentDialog.tsx` *(нов)*
- `src/pages/Auth.tsx` *(refactor + warnings)*

**По избор (Част D):**
- `src/pages/admin/EmailsDashboard.tsx` *(нов)*
- `src/components/admin/EmailStatsCards.tsx` *(нов)*
- `src/components/admin/EmailLogTable.tsx` *(нов)*
- `src/App.tsx` *(нов route)*

## Въпрос за теб
Да включа ли Част D (admin dashboard) в имплементацията сега, или само A + B + warm-up документация?
