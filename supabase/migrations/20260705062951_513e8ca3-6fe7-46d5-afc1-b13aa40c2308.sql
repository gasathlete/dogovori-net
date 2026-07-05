-- Idempotent seed of additional compliance controls
INSERT INTO public.compliance_items (framework, control_ref, title, description, status, owner_role, evidence_notes, priority)
VALUES
  -- GDPR (extra articles beyond existing set)
  ('GDPR', 'Art.5',  'Принципи за обработване', 'Законосъобразност, добросъвестност, прозрачност, ограничение на целите, минимизация, точност, ограничение на съхранението, цялостност, отчетност.', 'done', 'DPO', 'Privacy policy /privacy, ROPA, retention-sweeper', 'high'),
  ('GDPR', 'Art.6',  'Правно основание', 'Матрица цел ↔ основание в /privacy т.2 и в ROPA.', 'done', 'DPO', '/legal/ropa, Privacy §2', 'high'),
  ('GDPR', 'Art.7',  'Условия за съгласие', 'user_consents таблица със версия, IP хеш, UA, дата, оттегляне.', 'done', 'DPO', 'user_consents; src/lib/consents.ts', 'high'),
  ('GDPR', 'Art.8',  'Съгласие на деца', 'Услугата е забранена под 18 г. Age gate при регистрация и Google OAuth.', 'done', 'Product', 'AgeConfirmDialog, GoogleConsentDialog', 'high'),
  ('GDPR', 'Art.9',  'Специални категории данни', 'Хардуерен блок в classify.ts + restricted_processing_events логове.', 'done', 'DPO', 'supabase/functions/_shared/classify.ts', 'critical'),
  ('GDPR', 'Art.12', 'Прозрачно информиране', 'Всички политики публикувани на /legal, четивен език, версия и дата.', 'done', 'DPO', '/legal/*', 'medium'),
  ('GDPR', 'Art.13', 'Информация при събиране', 'Privacy Policy покрива идентичност, цели, основание, срокове, права, DPO контакт.', 'done', 'DPO', '/privacy', 'high'),
  ('GDPR', 'Art.16', 'Право на корекция', 'Profile settings + support email.', 'done', 'Product', '/account settings', 'medium'),
  ('GDPR', 'Art.18', 'Право на ограничаване', 'Реализирано през заявка към DPO email.', 'in_progress', 'DPO', 'manual workflow', 'medium'),
  ('GDPR', 'Art.21', 'Право на възражение', 'Marketing opt-out линкове в email, cookies revoke.', 'done', 'DPO', 'handle-email-unsubscribe', 'medium'),
  ('GDPR', 'Art.22', 'Автоматизирано вземане на решения', 'Няма автоматизирано решение с правни последици — AI е консултативен, човекът потвърждава.', 'done', 'DPO', 'AIDisclaimerModal, /privacy §6', 'high'),
  ('GDPR', 'Art.24', 'Отговорност на администратора', 'Политики, DPIA, ROPA, обучение на екипа, ревюта на достъп.', 'in_progress', 'DPO', 'docs/ACCESS_POLICY.md', 'medium'),
  ('GDPR', 'Art.25', 'Data protection by design & default', 'Псевдонимизация преди AI, RLS по подразбиране, най-строг retention по подразбиране.', 'done', 'CTO', 'redact.ts, RLS policies', 'high'),
  ('GDPR', 'Art.28', 'Договори с обработващи (DPA)', 'DPA публикуван на /dpa; регистър на подпроцесори с дати и региони.', 'done', 'DPO', '/dpa, /subprocessors', 'high'),
  ('GDPR', 'Art.34', 'Уведомяване на субекти при пробив', 'Playbook + шаблон в /admin/breaches.', 'done', 'DPO', 'docs/BREACH_PLAYBOOK.md', 'high'),
  ('GDPR', 'Art.37', 'Назначаване на DPO', 'Не е задължителен по критериите на чл. 37; определено контактно лице по защита на данните.', 'not_applicable', 'DPO', '/privacy §1.1', 'low'),
  ('GDPR', 'Art.44', 'Международни трансфери', 'SCC + DPF + EU-only опция за чувствителни потребители.', 'done', 'DPO', '/privacy §4, /subprocessors', 'high'),
  ('GDPR', 'Art.83', 'Санкции — мониторинг', 'Мониторинг на решения на КЗЛД и EDPB чрез /legal/knowledge-base.', 'in_progress', 'DPO', '/legal/knowledge-base', 'low'),

  -- AI Act (extra articles)
  ('AI_ACT', 'Art.9',  'Управление на риска', 'FRIA + следене на post-market метрики.', 'done', 'DPO', 'docs/FRIA.md, /admin/ai-post-market', 'high'),
  ('AI_ACT', 'Art.10', 'Данни и governance', 'Не се извършва обучение — само prompt engineering на foundation модели.', 'done', 'CTO', 'docs/AI_ACT_TECHNICAL_FILE.md', 'medium'),
  ('AI_ACT', 'Art.14', 'Човешки надзор', 'AI disclaimer на всеки резултат, risk meter, ръчна редакция, човешки преглед по заявка.', 'done', 'Product', 'AIDisclaimerModal', 'high'),
  ('AI_ACT', 'Art.15', 'Точност, надеждност, кибер сигурност', 'Fallback chain, rate limits, prompt-injection тестове.', 'done', 'CTO', 'model-router.ts, redact.test.ts', 'high'),
  ('AI_ACT', 'Art.17', 'Система за качество', 'Code review, миграции с ревю, годишен pentest.', 'in_progress', 'CTO', 'docs/SOC2_ISO27001_READINESS.md', 'medium'),

  -- SOC 2 (Trust Services Criteria core)
  ('SOC2', 'CC1.1', 'Integrity and ethical values', 'Публикувани политики, code of conduct за екипа, whistleblower канал (security@).', 'in_progress', 'HR', 'docs/ACCESS_POLICY.md', 'medium'),
  ('SOC2', 'CC2.1', 'Communication of policies', 'Всички политики публикувани на /legal и в интранет; onboarding checklist.', 'in_progress', 'HR', 'docs/*.md', 'medium'),
  ('SOC2', 'CC3.1', 'Risk assessment', 'Годишен риск-регистър, FRIA, DPIA, LIA.', 'done', 'DPO', 'docs/LIA_audit_security.md, docs/FRIA.md', 'high'),
  ('SOC2', 'CC4.1', 'Monitoring activities', 'Sentry, Supabase logs, audit_log, ai_audit_log.', 'done', 'CTO', 'src/lib/sentry.ts, audit_log', 'medium'),
  ('SOC2', 'CC5.1', 'Control activities', 'RLS политики, GRANT-и, MFA guard, retention sweeper.', 'done', 'CTO', 'RLS + AdminMFAGuard', 'high'),
  ('SOC2', 'CC6.2', 'Logical access provisioning', 'is_staff роля + AdminMFAGuard; 90-дневни access reviews.', 'in_progress', 'CTO', 'docs/ACCESS_POLICY.md §5', 'high'),
  ('SOC2', 'CC6.3', 'Access removal at termination', '24-часов SLA за премахване на достъп при напускане.', 'in_progress', 'HR', 'docs/ACCESS_POLICY.md §5', 'high'),
  ('SOC2', 'CC6.7', 'Data at rest & in transit encryption', 'TLS 1.2+ навсякъде; AES-256 at rest в Supabase.', 'done', 'CTO', 'infra config', 'high'),
  ('SOC2', 'A1.1', 'Capacity planning', 'Supabase auto-scaling; monitoring на bandwidth и compute.', 'in_progress', 'CTO', 'Supabase dashboard', 'medium'),
  ('SOC2', 'PI1.1', 'Processing integrity', 'Idempotency ключове за плащания и AI операции; validation преди insert.', 'done', 'CTO', 'stripe idempotency; op-session', 'medium'),
  ('SOC2', 'C1.1', 'Confidentiality of information', 'PII redaction преди AI; забрана за export без owner check.', 'done', 'CTO', 'redact.ts; export-my-data', 'high'),
  ('SOC2', 'P1.1', 'Privacy notice', 'Пълна политика на /privacy и /cookies.', 'done', 'DPO', '/privacy, /cookies', 'medium'),

  -- ISO 27001 Annex A (2022 revision — key controls)
  ('ISO27001', 'A.5.7',  'Threat intelligence', 'Абонамент за CVE + GitHub Dependabot + седмичен security scan.', 'in_progress', 'CTO', '.github/workflows/security-scan.yml', 'medium'),
  ('ISO27001', 'A.5.9',  'Inventory of information and assets', 'Регистър на активите (Supabase проекти, домейни, secrets).', 'in_progress', 'CTO', 'docs/ACCESS_POLICY.md', 'medium'),
  ('ISO27001', 'A.5.10', 'Acceptable use of assets', 'Employee handbook, чист desk политика за отдалечена работа.', 'todo', 'HR', 'Draft in progress', 'low'),
  ('ISO27001', 'A.5.15', 'Access control', 'Role-based access, MFA, least privilege.', 'done', 'CTO', 'docs/ACCESS_POLICY.md', 'high'),
  ('ISO27001', 'A.5.23', 'Information security for use of cloud services', 'Vendor DD checklist изпълнена за Supabase, Stripe, Resend, Google.', 'done', 'DPO', 'docs/VENDOR_DD_CHECKLIST.md', 'high'),
  ('ISO27001', 'A.5.24', 'Incident management planning', 'Playbook + /admin/breaches таблица.', 'done', 'DPO', 'docs/BREACH_PLAYBOOK.md', 'high'),
  ('ISO27001', 'A.5.29', 'Business continuity', 'BCP/DR план + тримесечни restore drills.', 'done', 'CTO', 'docs/BCP_DR_PLAN.md', 'high'),
  ('ISO27001', 'A.5.33', 'Protection of records', 'Immutable audit_log; 10-годишен fiscal retention.', 'done', 'DPO', 'audit_log RLS', 'medium'),
  ('ISO27001', 'A.6.6',  'Confidentiality agreements', 'NDA за всеки нов contractor/employee.', 'in_progress', 'HR', 'HR pipeline', 'medium'),
  ('ISO27001', 'A.6.8',  'Reporting information security events', 'security.txt + security@ канал.', 'done', 'DPO', 'public/.well-known/security.txt', 'medium'),
  ('ISO27001', 'A.8.2',  'Privileged access rights', '90-дневни access reviews, отделни staff акаунти с MFA.', 'in_progress', 'CTO', 'docs/ACCESS_POLICY.md §5', 'high'),
  ('ISO27001', 'A.8.9',  'Configuration management', 'Всичко през git + migrations; secrets в Lovable secret store.', 'done', 'CTO', 'supabase/migrations', 'medium'),
  ('ISO27001', 'A.8.24', 'Cryptography', 'TLS 1.2+, AES-256, bcrypt пароли, хеширани IP-та.', 'done', 'CTO', 'infra', 'high'),
  ('ISO27001', 'A.8.28', 'Secure coding', 'ESLint + code review + Supabase linter в CI.', 'done', 'CTO', '.github/workflows', 'medium'),
  ('ISO27001', 'A.8.32', 'Change management', 'PR review, миграции с одобрение, changelog за legal.', 'in_progress', 'CTO', '/legal/changelog', 'medium')
ON CONFLICT (framework, control_ref) DO NOTHING;