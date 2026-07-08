
# План: Ограничен безплатен план + меко-стойностна конверсионна фуния

## 1. Нова карта на достъпа (free vs paid)

| Функция | Свободна регистрация | Плащащ (Проф./Предпр./Екип) |
|---|---|---|
| Разглеждане на каталог | ✅ неограничено | ✅ |
| Направа на документ през шаблон (wizard + preview) | ✅ неограничено, свалянето = 1 op | ✅ |
| Изготви документ „from scratch" (BuildContract wizard + preview) | ✅ неограничено, финализирането = 1 op | ✅ |
| Качване на документ за анализ + score | ✅ неограничено качвания, вижда се общ score/бадж | ✅ |
| Корекции по качен документ | ✅ **само 2 корекции**, след това замъглени | ✅ пълни |
| Пълен Risk Analysis (детайли, цитати, препоръки) | 🔒 blurred preview | ✅ |
| AI Асистент (чат) | 🔒 blurred след 1 демо отговор | ✅ |
| Двуезични договори | 🔒 blurred preview (само заглавие) | ✅ |
| e-Подпис | 🔒 заключен, илюстрация + CTA | ✅ |
| Комплекти (Kits) | 🔒 заключен, илюстрация + CTA | ✅ |
| Свалени/финализирани документи (ops) | **5 при регистрация, после 2/месец** | 100 (Предпр.), 50 (Проф.), 100/seat (Екип) |
| Top-up пакети | 🚫 | ✅ (само за активни абонати) |

Правило: „op" се харчи само за реалната стойност (готов сваляем документ или waves корекции), НЕ за разглеждане/пробване.

## 2. Backend промени (`download_quota` + edge функции)

**Схема (`supabase--migration`):**
- Нова колона `download_quota.corrections_free_used_count int not null default 0` — брояч (0–2) на free корекциите по качен документ, вместо boolean `corrections_free_used`.
- Нова колона `download_quota.free_signup_ops_cap int not null default 5` — задава първо-месечен бонус.
- Backfill: за съществуващи free потребители, ако `signup_at < now() - 30d` → cap = 2, иначе 5.
- Функция `public.free_ops_cap(uid uuid) returns int` (SECURITY DEFINER) която връща 5 в първите 30 дни, 2 след това.
- Update на `useIsPro.tsx`: за free `opsCap = free_ops_cap(user.id)` вместо hard-coded 10.

**Edge функции (gating):**
- `download-document`: остава — брои 1 op срещу новия cap.
- `apply-corrections` (или еквивалент за качен анализ): за free — позволява max 2 waves общо/качен документ, после връща `402 free_corrections_exhausted`. Хвърля структурирана грешка, която фронтендът превежда в upgrade dialog.
- `assistant-chat`: за free — позволява **1 съобщение per session**, после `402 free_assistant_exhausted`.
- `bilingual-generate`, `signing-create`, `kits-*`: `402 paid_only` за free (client-side и server-side).

## 3. Frontend gating (замъгляване + CTA)

Нов reusable компонент **`<PaidOnlyOverlay>`** (`src/components/paywall/PaidOnlyOverlay.tsx`):
- Приема `{ pillar, headline, sub, children }`.
- Рендерира `children` в `filter: blur(6px) saturate(0.7)`, `pointer-events: none`, отгоре glass card с иконка + headline + CTA „Виж Предприемач".
- Track: `paywall_shown` с `pillar` при mount.

**Точки на прилагане:**
- `src/pages/Assistant.tsx` + `AssistantChat.tsx` — след 1-ви отговор, останалите съобщения в overlay.
- `src/components/wizard/RiskReport.tsx` (пълен анализ) — показва score band, детайлите под overlay.
- `src/pages/WizardBilingual.tsx` — целият preview под overlay след заглавието.
- `src/components/MultiPartySigningDialog.tsx` + „Подпиши" бутоните — заключени с overlay.
- `src/pages/KitDetail.tsx` + „Създай комплект" — overlay.
- `src/components/wizard/CorrectionsPanel.tsx` — след 2-ра wave, останалите корекции blurred + „Отключи всички корекции".

`useFreeJourneyStage` разширение:
- нови състояния `assistantUsed`, `correctionsUsed`, `pillarSeen: Set<Pillar>` (localStorage-backed).
- нов stage `4 = post-paywall-viewed` (потребителят е видял ≥3 pillar overlays без upgrade — стартира по-мек nudge панел).

## 4. Петте стълба на конверсията (меко-стойностни, без countdown)

Всеки стълб = отделно място/момент, където потребителят *сам* иска upgrade. Всеки стълб има един собствен event (`pillar_view`, `pillar_cta_click`) за фунияна аналитика.

### Стълб 1 — „Value-first onboarding" (Discovery)
- Първи вход след регистрация: `PlanWelcomeDialog` показва „Имаш 5 безплатни операции за първия месец" + карта „Какво отключваш с Предприемач" (списък от 6 иконки), CTA „Виж плана" (secondary).
- Няма urgency; акцент върху бонуса.

### Стълб 2 — „Aha инжекция след 1-ва свалена операция" (Aha)
- След първо успешно сваляне/финализиране на документ (`dogovori:op-completed`):
  - `ActionCelebration` toast: „Готово! Спести си X мин. С Предприемач: неограничени двуезични + e-Подпис."
  - CTA: „Виж как работи Предприемач" → отваря `ProUpgradeDialog` с pre-selected tab „Value tour" (нова секция: 30-сек видео/карусел с 4 сценария).

### Стълб 3 — „Feature-locked pillar overlays" (Curiosity)
- Всеки от 4-те заключени стълба (Асистент, Risk Analysis, Двуезични, e-Подпис/Комплекти) при първо посещение показва `PaidOnlyOverlay` с **микро-демо** — 1 GIF/статичен screenshot от реалната функция + една конкретна полза („Спестяваш ~40 мин на договор").
- CTA: „Отключи [функция]" → отваря `ProUpgradeDialog?trigger=<pillar>`.
- След затваряне без upgrade → маркира `pillarSeen`. Не се показва пак като модал; остава като inline overlay.

### Стълб 4 — „Corrections wall" (Consideration)
- В `CorrectionsPanel` при качен документ след 2-ра wave:
  - Inline карта над blurred корекции: „Приложи всички AI корекции — обикновено са 6–12 за такъв договор. С Предприемач: неограничени корекции + експорт с track changes."
  - Показва конкретния брой останали корекции: „Остават 8 препоръки за прилагане".
  - CTA: „Виж Предприемач — 19.90 €/мес".

### Стълб 5 — „Soft cap reached" (Convert)
- Когато `opsUsed >= opsCap` (2/мес или 5 за първия месец):
  - Пълноекранен но не-блокиращ панел на `/build`, `/analiz`, `/assistant`: „Достигна безплатните си операции за месеца. Продължи веднага с Предприемач."
  - 3 карти: Проф. 12.90 / Предпр. 19.90 (highlighted, „Най-избран") / Топ-ъп пакет (за неактивен план: disabled с tooltip „Първо се абонирай").
  - Долу: „Или изчакай {N} дни за нови безплатни операции" — прозрачност вместо натиск.
  - Loyalty ред: „Абонатите получават 5–15% отстъпка доживот след 3-ти месец".

### Стълб 6 (бонус) — „Social proof re-engagement"
- След 7 дни неактивност на free потребител: email + in-app banner „Виж какво постигнаха X души този месец с Предприемач" — линк към `/plans` с anchor към testimonials.

## 5. Analytics & измерване

Разширение на `trackEvent` в `src/lib/analytics.ts`:
- Нови events: `pillar_view`, `pillar_cta_click`, `paywall_shown`, `paywall_dismissed`, `free_cap_hit`, `upgrade_started`, `upgrade_completed`.
- Всички носят `{ pillar, stage, opsUsed, opsCap }`.
- Table `funnel_events` вече съществува — insert от client чрез съществуващия wrapper.

Успех = conversion rate по стълб (Стълб N → `upgrade_completed` в 7 дни).

## 6. Copy & tone (Bulgarian, professional)

- Никакви countdown таймери, „последен шанс", exit-intent modals.
- Формула: **Стойност → Конкретна цифра/полза → Меко CTA**.
- Примери:
  - „Спестяваш ~40 мин на договор" (не „Само днес!").
  - „Виж Предприемач" (не „Абонирай се СЕГА").
  - „Остават ти 2 безплатни операции този месец" (факт, не заплаха).

## 7. Redirect & memory

- Обновяване на `mem://index.md` Core:
  - Free ops: 5 първи месец, 2/мес след това.
  - Free scope: каталог + build + wizard + upload анализ (score + 2 корекции). Всичко останало = paid, показано blurred.
- Няма промяна на цените или top-up логиката.

## 8. Технически детайли (за разработчик)

**Файлове за създаване:**
- `src/components/paywall/PaidOnlyOverlay.tsx`
- `src/components/paywall/PillarLockCard.tsx` (микро-демо + CTA)
- `src/components/paywall/SoftCapPanel.tsx` (Стълб 5)
- `src/hooks/usePillarTracking.ts` (localStorage `pillarSeen`)
- `supabase/migrations/<ts>_free_plan_restriction.sql`

**Файлове за редакция:**
- `src/hooks/useIsPro.tsx` — dynamic opsCap от `free_ops_cap()`.
- `src/hooks/useFreeJourneyStage.ts` — добавя pillarSeen, assistantUsed, correctionsUsed.
- `src/components/AssistantChat.tsx` + `AssistantPaywall.tsx` — 1 message free, после overlay.
- `src/components/wizard/CorrectionsPanel.tsx` — 2 waves free, после overlay + Стълб 4 карта.
- `src/components/wizard/RiskReport.tsx` — blur детайли за free.
- `src/pages/WizardBilingual.tsx` — заключване.
- `src/pages/KitDetail.tsx`, `src/components/MultiPartySigningDialog.tsx` — заключване.
- `src/components/PlanWelcomeDialog.tsx` — Стълб 1 нов layout.
- `src/components/ProConversionToast.tsx` — Стълб 2 „aha" copy.
- `src/components/ProUpgradeDialog.tsx` — нов tab „Value tour" + trigger routing.
- `src/pages/Plans.tsx` — soft-cap secondary panel за stage 3.
- `src/lib/analytics.ts` — нови event types.

**Edge функции за редакция:** `apply-corrections`, `assistant-chat`, `download-document` (само cap източник), `bilingual-*`, `create-signing-request`, `kits-*`.

**Тестове:**
- `src/test/quota.test.ts` — разширяване с новия dynamic cap.
- Нов `src/test/free-plan-gating.test.tsx` — snapshot на overlays за 4-те стълба.

## 9. Извън скоупа (няма да пипаме)

- Ценообразуване (остава: Проф. 12.90, Предпр. 19.90, Екип 109/год.).
- Top-up логика.
- Stripe продукти/webhooks.
- Payments compliance.
