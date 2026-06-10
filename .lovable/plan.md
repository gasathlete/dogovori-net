# План: правни корекции преди launch (25.06.2026)

Базиран на адвокатския меморандум. Всички 10 блокиращи точки + критични 30‑дневни се изпълняват преди 25.06.

## A. GDPR роли, основания и DPA (т. 1, 3)

1. **Разделяне на ролите** в `Privacy.tsx`, `DPA.tsx`, `ROPA.tsx`, `legal-memorandum`:
   - Dogovori.net **като администратор** — акаунти, плащания, фактури, сигурност, маркетинг, продуктова аналитика.
   - Dogovori.net **като обработващ** — съдържание на качени документи и AI операции по възлагане на потребителя.
   - **Потребителят като администратор** за данни на трети лица.
2. **Правни основания** — пренаписване на таблицата „операция → основание“ по модела от меморандума (договор за услугата; легитимен интерес само за audit/security; съгласие само за маркетинг/analytics/optional model improvement).
3. **LIA документ** — `docs/LIA_audit_security.md` за audit logs, fraud prevention, security monitoring.
4. **Обвързващо приемане на DPA** при регистрация/абонамент за бизнес/Team:
   - нов чекбокс „Приемам DPA в качеството си на администратор за данните на трети лица“;
   - запис в `user_consents` с версия и timestamp.
5. **Декларация в Terms** — потребителят гарантира правно основание да качва данни на трети лица (клауза 8.3).

## B. Псевдонимизация и AI логване (т. 1.3)

1. Code review на `_shared/redact.ts` + всички AI edge функции:
   - hard‑guard: никога не логва `originalText`, `redactionMap`, `prompt`, `response.text`, stack traces с фрагменти.
   - `redactionMap.clear()` във `finally`.
   - Само `piiStats`, токени, model, operation, status → `ai_audit_log`.
2. Unit тест `redact.test.ts` за no‑leak guarantee.

## C. Преименуване на illegal_content_attempts (т. 1.4)

1. Migration: `illegal_content_attempts` → **`restricted_processing_events`**.
   - колони: `user_id`, `event_type`, `category_code` (enum: `health_data | biometric | criminal | minors | political_religious | other`), `operation`, `action`, `created_at`.
   - **без** сурово съдържание, без фрагменти.
   - RLS + GRANT.
2. Update код: `_shared/illegal-content.ts`, `AdminIllegalContent.tsx` → `AdminRestrictedProcessing.tsx`.
3. UI текст: „Документът изглежда съдържа чувствителни лични данни. Поради защита на Вашата поверителност автоматизираният AI анализ не е наличен за този файл.“

## D. DPIA — премахване от user profile (т. 1.5)

1. Премахване на бутона „DPIA download“ от `Account.tsx`.
2. Премахване на `public/dpia-dogovori-net.docx`.
3. Генериране на **DPIA Summary** (`public/dpia-summary-dogovori-net.pdf` + страница `/legal/dpia-summary`): какви данни, защо, защити, права, контакт. Без архитектура/слабости/residual risk.
4. Пълната DPIA се пази вътрешно в `docs/internal/DPIA_full.md` (не се сервира).

## E. Електронен подпис — ЗЕДЕУУ корекции (т. 2)

1. **Пренаписване на правния текст** в `IncidentResponse.tsx` (премахване на „SES няма правна сила, равностойна на саморъчния подпис“). Заменя се с формулировката от т. 2.1.
2. **Signing flow** (`SigningEnvelope.tsx`, `MultiPartySigningDialog.tsx`):
   - отделен чекбокс „Съгласявам се този електронен подпис ... да има правната сила на саморъчен подпис ...“;
   - при подпис от ЮЛ — нови полета: `eik`, `signer_capacity` (управител/пълномощник/служител/друго), декларация за представителна власт;
   - предупреждение „Dogovori.net не проверява представителната власт ...“;
   - препоръка за QES при високорискови документи.
3. **Audit trail** — `signing_audit_events` се обогатява с: doc hash, envelope id, IP, user-agent, channel, document_version, consent_text_version. Документира се отделно от `ai_audit_log` с по‑дълъг retention (обвързан с давност/договор).
4. Клауза 8.2 от меморандума в Terms.

## F. ЗЕТ — посредник при електронно изявление (т. 2.3)

1. `signature_audit_trail` retention ≥ 12 м., практически до изтичане на давност или докато документът е в профила. `ai_audit_log` остава 12 м.
2. Описание в Terms + Retention Policy.

## G. ЗЕТ/ЗЗП — информация за доставчика и checkout (т. 3.1–3.3)

1. **`/legal/contacts`** — пълно търговско наименование, ЕИК/БУЛСТАТ, седалище и адрес на управление, email, телефон, ДДС №, лице за GDPR, контакт за DSA.
2. **Checkout flow** (`StripeEmbeddedCheckout.tsx`, `CheckoutReturn.tsx`):
   - екран „Преглед на поръчката“ с цена с/без ДДС, период;
   - бутон „Потвърждавам поръчката и се задължавам да платя“;
   - линкове към Terms, Privacy, Withdrawal, Refund;
   - email потвърждение след сключване.
3. **`order_snapshots` таблица** + edge function записва snapshot при всяка покупка: plan, price, vat, версии на правни документи, IP, UA.
4. Технически средства за поправяне на грешки + езици на договора в Terms § „Електронно сключване“.

## H. Маркетингови твърдения (т. 3.4)

1. Глобален audit на копи в `src/pages/Index.tsx`, `ComplianceSection.tsx`, `Plans*`, blog seed: премахване на „изцяло правно издържани“, „без риск“, „гарантирано съответствие“, „сертифицирани“, „SOC2 compliant“.
2. Замяна с: „подпомага изготвянето и анализа“, „AI резултатите подлежат на човешка проверка“, „не замества правна консултация“, „ISO 27001/SOC 2 readiness — в процес на подготовка“.

## I. Cookies (т. 4)

1. `Cookies.tsx` + `llms.txt` — корекция: **чл. 4а ЗЕТ** (не ЗЕС).
2. `CookieBanner.tsx` — analytics/marketing скриптове да НЕ се зареждат преди избор; gating през `cookieConsent.{analytics,marketing}`.
3. Бутон **„Промени настройките за бисквитки“** във `Footer.tsx`.
4. Запис в `user_consents`: категории, версия на cookie policy, timestamp, source, pseudo session id.

## J. Трансфери извън ЕС (т. 5)

1. **`/legal/subprocessors`** — за всеки доставчик: ЮЛ, държава, регион на обработка, transfer outside EEA (yes/no), основание/SCC/DPF, training (yes/no), retention, линк към DPA. Премахване на „когато е възможно“.
2. **Account setting** „Само EU processing за AI заявки“ (per‑user + per‑team) → `profiles.allow_third_country_ai` (default `true` за consumer, `false` за бизнес).
3. Edge functions: hard guard
   ```ts
   if (!allowNonEU && model.requiresNonEUTransfer) throw ...
   ```
4. Routing fallback актуализиран в `model-router.ts`.

## K. Retention — премахване на противоречия (т. 6)

1. Update `RetentionPolicy.tsx` + `retention-sweeper`:
   - `extracted_text` → **7 дни** (вместо 90), документирано.
   - matrix таблица в политиката съвпада с реалния sweeper.
2. Сверяване на `ai_audit_log` (12м), `signing_audit_events` (≥ давностен срок), saved documents (докато са в профила).

## L. AI Act & AI Acknowledgement (т. 7)

1. Преименуване на „AI processing consent“ → **„AI acknowledgement“** в UI/код/`user_consents.consent_type`.
2. Истинско съгласие — само за маркетинг, analytics, optional model improvement, optional non‑EU AI.
3. **Hard warning банер** при високорискови типове документи (имоти, трудови, потребителски кредити, заеми, прехвърляне на дялове, пълномощни, семейни, нотариална форма, специални категории) — `RiskWarningBanner.tsx`.
4. Disclaimer text под всеки AI output: „Това е автоматично генериран резултат ...“ (вече има, но унифициране).

## M. Terms клаузи (т. 8.1–8.5)

Добавяне/пренаписване в `Terms.tsx` на клаузи 8.1 (AI резултати), 8.2 (е‑подпис), 8.3 (данни на трети лица), 8.4 (забранени документи), 8.5 (балансирана отговорност, без изключване на умисъл/груба небрежност).

## N. Сигурност — преди launch (т. 9.1–9.4)

1. **`docs/ACCESS_POLICY.md`** — кой/кога/как получава prod достъп, quarterly review.
2. **Отделяне на среди** — документиране на production/staging/development; забрана за реални документи в dev/staging без анонимизация (`docs/ENV_POLICY.md`).
3. Първи **restore drill** изпълнен и логнат в `restore_drills`.
4. Incident response runbook — потвърждение 72ч SLA + темплейт за уведомление (вече има, само review).

## O. Launch checklist update

Compliance Dashboard (`AdminCompliance.tsx`) — нова секция „Pre‑launch 25.06“ с тези 10 точки + статус/owner/evidence.

---

## Технически детайли

- Migrations:
  - rename `illegal_content_attempts` → `restricted_processing_events` (+ нов enum за `category_code`).
  - нова `order_snapshots` (id, user_id, plan, price, currency, vat_included, terms_version, privacy_version, withdrawal_version, refund_version, ip, user_agent, created_at). GRANT + RLS.
  - `profiles.allow_third_country_ai boolean default true`.
  - `teams.eu_only_ai boolean default false`.
  - `signing_request_signers`: `eik`, `signer_capacity`, `representative_declaration_accepted`, `ses_equivalence_accepted`.
- Edge functions update: всички AI функции — proверка `eu_only_ai` + no‑leak логване.
- Тестове: `redact.test.ts` no‑leak, `order-snapshot.test.ts`, schema на `restricted_processing_events`.
- Файлове: премахване на `public/dpia-dogovori-net.docx`; нова `dpia-summary-dogovori-net.pdf` + `/legal/dpia-summary` route; нова `docs/LIA_audit_security.md`, `docs/ACCESS_POLICY.md`, `docs/ENV_POLICY.md`, `docs/internal/DPIA_full.md`.

## Извън скоупа за 25.06 (отлагат се за +30 дни)

- Vendor DPA pack за всеки subprocessor (организационно).
- Публичен changelog на legal docs + автоматизирано versioning.
- Subprocessor change notice mechanism (email broadcast).
- Първи external pen‑test.

Готов съм да започна изпълнението веднага щом одобрите плана.
