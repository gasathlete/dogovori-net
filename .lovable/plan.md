
# Pricing sweep + Engagement loop

## 1. Pricing — единни стойности навсякъде

Канонични цени (DB вече е чист — sync-ваме само кода и Stripe):

| План | Месечно | Годишно | Ops/мес |
|---|---|---|---|
| Free | 0 | 0 | 5 при регистрация + 2/мес |
| Професионалист | 12.90 € | 129 € | 50 |
| Предприемач | 19.90 € | 199 € | 120 (GPT-5, Premium 24/7) |
| Екип | — | 109 €/seat/год (min 3 = 327 €/год) | 100/seat |

Top-up пакети (само за абонати):
- **Нов:** `topup_5` — 5 ops / 2.90 € (0.58 €/оп.) — иконка `Plus`
- `topup_20` — 5.40 €, `topup_50` — 12.90 € (Най-избиран), `topup_100` — 23.90 € (Най-изгоден)
- `topup_10` се **деактивира** в Stripe и премахва от UI

## 2. Файлове за обновяване

**Frontend pricing copy / caps**
- `src/lib/plansData.ts` — FAQ: премахни „10 оп. — 2.90 €" ред, оправи разликата Проф/Предпр, цени.
- `src/data/faqItems.ts` — sweep на цените.
- `src/components/TopupPacks.tsx` — добави `topup_5` най-отпред; премахни `topup_10`.
- `src/components/AssistantPaywall.tsx` — копи: „5 безплатни + 2/мес.", „Предприемач: 120 операции/мес.".
- `src/components/ProUpgradeDialog.tsx` — всички 100→според плана (Проф 50, Предпр 120, Екип 100/seat).
- `src/components/ProConversionToast.tsx`, `src/components/PainSolution.tsx`, `src/components/Hero.tsx` — sync копи.
- `src/pages/Plans.tsx`, `src/pages/Team.tsx`, `src/pages/account/SubscriptionTab.tsx` — sync статични числа.
- `src/pages/Template.tsx`, `src/pages/legal/Terms.tsx` — pricing mentions.
- `src/lib/seo/schemas.ts`, `src/lib/jsonLd.ts` — Product/Offer JSON-LD цени.
- `src/hooks/useIsPro.tsx` — `opsCap` per tier (Free=2 mo + 5 first month bonus от `signup_at`; Проф=50; Предпр=120; Екип=100). Чете `priceId` за tier resolution (вече има).
- `src/lib/planTier.ts` — `OPS_CAP` вече e чист, остава.

**Stripe**
- `payments--create_price` за `topup_5` (290 cents EUR, one-time, qty 1/1, product `topup_pack` или нов `topup_5_pack`).
- Архивирай `topup_10` (ако е възможно), иначе само skip в UI.
- Провери yearly цени за professional/entrepreneur (`professional_yearly` = 12900, `entrepreneur_yearly` = 19900). Team yearly per-seat = 10900.

**Backend / edge functions**
- `supabase/functions/payments-webhook/index.ts` — добави `topup_5: 5` в ops-credit мапа; sync price IDs.
- `supabase/functions/assistant-chat/index.ts` — sync copy за лимити в system prompts.

**Email templates** — `payment-receipt.tsx`, `payment-failed.tsx`: премахни остарели цени.

**Templates seed copy** (`src/data/templateDrafts/*`, blog posts) — само там, където цени се споменават в маркетинг блокове, не в самите шаблонни договори (договорите остават legal text). Audit per-file.

**Calculator** `predizvestie-kt.ts` — pricing mention в meta/cta само.

## 3. Engagement loop (Lovable-style)

### 3a. Streak + дневен прогрес
- Нова таблица `user_engagement` (user_id PK, current_streak int, longest_streak int, last_active_date date, daily_goal int default 1, daily_progress int, updated_at).
- Edge function-less: update в client при всяко успешно op (download/template/upload/AI message) чрез RPC `bump_engagement(p_user uuid)` (SECURITY DEFINER) — increment streak ако `last_active_date = today-1`, reset ако по-старо, no-op ако today.
- UI компонент `<StreakBadge />` в header (desktop) + `<DailyProgressRing />` в `MobileBottomNav` около профил иконата. При достигане на дневна цел → confetti toast „Streak: N дни!".

### 3b. Контекстни upgrade nudges
- Refactor `ProConversionToast` → `useContextualNudge()` hook.
- Триггери:
  - 1-ва op: toast „Първият договор отнема под 2 мин ⚡" (без upgrade).
  - 2-ра op: chip „Спести ~4 ч/мес с Професионалист — 12.90 €" (soft, persistent 5s).
  - Последна op преди cap: dialog с ROI калкулатор „При 50 договора/мес → 12.90 € вместо 80+ €/час адвокат".
  - Cap reached: `ProUpgradeDialog` с динамичен trigger.
- Tracker: localStorage `nudge_history_v2` за honor frequency caps (max 1/ден от същия trigger).

### 3c. Empty-state suggestions
- Нов компонент `<SmartSuggestions context="assistant"|"catalog"|"home" />`.
- Източник: последни 5 reci_assistant_threads + последни 5 saved_documents + top-3 от relatedTemplates.
- Render: 3 хоризонтално-скролируеми карти с икона + 1-line CTA. На /assistant заменя placeholder-а в празен чат. На /catalog показва се над grid-а ако `templates_viewed_count = 0`.
- Server-light: query през съществуващи tables; ако няма история → fallback на curated „first-time" set от 6 шаблона (договор за изработка, NDA, наем, трудов, фактура, пълномощно).

### 3d. Post-action celebration
- Нов компонент `<ActionCelebration variant="download"|"analyze"|"sign" onNext />`.
- Trigger след `downloadDocument`, `analyzeContract`, успешен sign.
- Съдържа:
  - 2 sec animated checkmark + count-up за общо изработени документи (от `download_quota.monthly_total_used` cumulative).
  - „Какво следва?" CTA — 2 препоръчани next-step карти (напр. след наем → депозитна разписка + опис на инвентар). Източник: `src/data/relatedTemplates.ts`.
  - Опционално „Сподели" бутон (clipboard линк към шаблона).
- Honors `prefers-reduced-motion`.

## 4. Тестове / проверка
- `npm run test` за `pricing.test.ts` и `quota.test.ts` (update fixtures за нови caps).
- Visual check: /pricing, /, /assistant (paywall), /account?tab=billing (top-ups), /account?tab=subscription.
- Stripe sandbox: тестов checkout за `topup_5`, `professional_monthly`, `entrepreneur_yearly`, `team_yearly` (qty=3).

## 5. Памет
- Update `mem://index.md` Core с новите top-up пакети (5/2.90 + 20/50/100, без 10).
