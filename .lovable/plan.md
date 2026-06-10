# Post-Launch Compliance Plan (June 25 → +30/90 days)

Pre-launch waves (P0–Wave 3) са изпълнени и адресират всички 10 blocking items на адвокатския преглед. Този план обхваща *organizational* и *evidence* задачите, които юристите маркираха като „30-day post-launch" — за да не остане платформата с „празни" контроли след отваряне за реални клиенти.

## Цели

- Затваряне на AI Act документация (чл. 11, 13, 50, 72) преди първите 100 платени операции.
- Доказуема vendor due diligence за всеки subprocessor (Stripe, Lovable AI Gateway, Resend, Cloudflare).
- Стандартен RFC 9116 vulnerability disclosure канал.
- Записан, проследим breach workflow (72h КЗЛД) и BCP tabletop.
- Видимо governance: DPO контакт, policy review графици, training register, legal changelog.

## Какво ще се изгради

### 1. AI Act технически файл (Art. 11)
- `docs/AI_ACT_TECHNICAL_FILE.md` — описание на AI системата (purpose, risk class = limited risk per Art. 50), training/finetuning (= none, само prompt engineering), governance, model cards (Gemini 2.5 lite/flash/pro), classification & redaction pipeline, human oversight (Art. 14), accuracy & robustness metrics, cyber-security мерки.
- Линкване от `/legal/ai-processing-policy` и от админ compliance матрицата.

### 2. FRIA (Fundamental Rights Impact Assessment)
- `docs/FRIA.md` — оценка по Art. 27 AI Act: засегнати групи (consumers, SMEs), специфични рискове (errors in legal clauses, bias срещу нестандартни сценарии, language exclusion), смекчаващи мерки (disclaimers, human-in-the-loop, no fully automated legal decisions).
- Записва се като evidence pack в `compliance_items` (`AI_ACT.FRIA`).

### 3. Post-market monitoring (Art. 72)
- Нова таблица `ai_post_market_metrics` (date, operation, total_calls, blocked_count, redaction_count, fallback_count, user_complaints, special_category_blocks).
- Cron job `ai-post-market-rollup` (daily) агрегира от `ai_audit_log` и `restricted_processing_events`.
- Нова страница `src/pages/AdminAiPostMarket.tsx` — графики + експорт CSV.
- Месечен alert към DPO при отклонения (>2σ от 30-day baseline).

### 4. Vendor / Subprocessor Due Diligence
- Нова таблица `vendor_assessments` (vendor_name, last_reviewed_at, next_review_at, scc_signed, dpa_url, soc2_url, notes, status).
- Seed records за: Lovable Cloud (Supabase), Lovable AI Gateway, Stripe, Resend, Cloudflare.
- Нова страница `src/pages/AdminVendors.tsx` — checklist на DPA/SCC/SOC2 за всеки + reminders.
- `docs/VENDOR_DD_CHECKLIST.md` — стандартен въпросник.

### 5. Vulnerability Disclosure Policy + security.txt
- `public/.well-known/security.txt` (RFC 9116) с Contact, Expires, Encryption, Policy, Preferred-Languages.
- `src/pages/legal/SecurityPolicy.tsx` (рут `/legal/security`) — публична политика за responsible disclosure, в обхват/извън обхват, SLA отговор, безопасно зачитане (safe harbor).
- Линк във Footer.

### 6. Breach Notification Workflow (чл. 33–34 GDPR)
- Нова таблица `breach_incidents` (detected_at, category, affected_subjects_count, data_categories, risk_assessment, kzld_notified_at, subjects_notified_at, status, root_cause, remediation).
- `src/pages/AdminBreaches.tsx` — форма за регистриране, авто-таймер до 72h, генериране на черновa нотификация (template).
- `docs/BREACH_PLAYBOOK.md` — стъпки за detection → triage → notify → remediate → post-mortem.

### 7. Training Register
- Нова таблица `staff_training` (user_id, document_id, document_version, acknowledged_at).
- `src/pages/AdminTraining.tsx` — списък политики (ACCESS_POLICY, INCIDENT, LIA, AI_ACT_TF), checkbox „прочетох & разбирам", history.
- Първи логин на staff → задължителен модал (вграден в `AdminMFAGuard`).

### 8. Legal Changelog + User Notifications
- Нова таблица `legal_versions` (doc_key, version, summary, effective_at, changelog_md).
- `src/pages/legal/Changelog.tsx` (рут `/legal/changelog`) — публичен changelog на Terms/Privacy/DPA/Cookies.
- При материална промяна (`material_change=true`) → batch email към всички активни потребители (template `legal-update`).

### 9. BCP / DR Tabletop Exercise
- `docs/BCP_DR_PLAN.md` — RTO/RPO цели, runbook за: DB загуба, Lovable outage, Stripe outage, AI Gateway outage.
- Разширение на съществуващия `restore_drills` модул с поле `tabletop_exercise` (boolean) + scenario template.
- Calendar reminder на 6 месеца.

### 10. DPO Formalization
- `src/pages/legal/DPO.tsx` (рут `/legal/dpo`) — име, контакт, обхват, как се подава заявка по чл. 15–22.
- Update на Privacy/ROPA/DPA с линк.

### 11. Compliance Matrix Hard-Seed
- Миграция добавя seed `compliance_items` за всеки нов контрол (AI_ACT.ART11, AI_ACT.ART27, AI_ACT.ART50, AI_ACT.ART72, GDPR.ART33, GDPR.ART35, GDPR.VENDOR_DD, SOC2.CC7.2, SOC2.CC9.1) с owner role и due date.

## Какво НЕ е в обхват

- Външен SOC2 одит (изисква одиторска фирма — следваща стъпка след 6 месеца история).
- ISO 27001 сертификация.
- Третиране на копията/публикуването на DPIA full document извън вътрешен use.
- Реална рассилка на legal-update имейли преди публикация (template-ите се подготвят, изпращат се при първа реална промяна).

## Технически детайли

```
DB миграция (single transaction):
  - CREATE TABLE ai_post_market_metrics
  - CREATE TABLE vendor_assessments
  - CREATE TABLE breach_incidents
  - CREATE TABLE staff_training
  - CREATE TABLE legal_versions
  - ALTER TABLE restore_drills ADD COLUMN tabletop_exercise boolean DEFAULT false
  - GRANT + RLS (staff-only за breach/vendor/training; public read за legal_versions)
  - Seed: vendor_assessments × 5, legal_versions × 6, compliance_items × 9

Edge functions:
  - supabase/functions/ai-post-market-rollup (scheduled daily via pg_cron + pg_net)
  - supabase/functions/send-legal-update (batched)

Нови маршрути:
  - /legal/security, /legal/dpo, /legal/changelog
  - /admin/ai-post-market, /admin/vendors, /admin/breaches, /admin/training

Docs:
  - docs/AI_ACT_TECHNICAL_FILE.md
  - docs/FRIA.md
  - docs/VENDOR_DD_CHECKLIST.md
  - docs/BREACH_PLAYBOOK.md
  - docs/BCP_DR_PLAN.md
```

Реализация в 3 последователни вълни (за да остане проектът компилируем):

- **Wave A — DB + docs**: миграция + всички MD файлове.
- **Wave B — Public legal**: SecurityPolicy, DPO, Changelog страници + security.txt + Footer линкове.
- **Wave C — Admin модули**: AiPostMarket, Vendors, Breaches, Training + edge функция за rollup.

Очаквана продължителност: ~3 build съобщения, без UI на крайния потребител да се счупи в нито един момент.

## Одобрение

Готов съм да започна с Wave A веднага щом одобрите плана. Ще се движа последователно през A → B → C и ще докладвам след всяка вълна.
