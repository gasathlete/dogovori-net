
## 1. New plan structure

| Tier | Code key | Monthly | Yearly | Ops/month | Notes |
|---|---|---|---|---|---|
| Безплатен | `free` | 0 € | 0 € | 5 при регистрация + 2/мес | без промяна |
| **Професионалист** (NEW middle) | `professional` | **12.90 €** | **129 €** (≈10.75 €/мес) | **50** | всички сегашни Pro фичи |
| **Предприемач** (now top) | `entrepreneur` | **19.90 €** | **199 €** (≈16.60 €/мес) | **120** | всичко от Професионалист + приоритетна AI обработка + GPT‑5 + персонален onboarding + Premium support 24/7 |
| Екип | `team` | — (премахнато) | **109 €/seat/год** (мин. 3 = 327 €/год) | 100/seat | САМО годишно |

One-off pack `five_operations` (1.90 € / 5 ops) запазен.
FIRST100 продължава да важи за recurring планове (monthly 30%, yearly 40%).

## 2. Database changes (migration)

- `ALTER TYPE public.user_plan ADD VALUE 'professional'; ADD VALUE 'entrepreneur';`
- `UPDATE download_quota SET plan='professional' WHERE plan='pro';` — досегашните абонати на 12.90 €/100 ops стават Професионалист (без скок в цената; кап-ът им остава 100 grandfathered, виж §4).
- Добавя се колона `download_quota.plan_ops_cap INT` (NULL = auto от plan, иначе явен grandfathered cap) за плавна миграция.
- Trigger `enforce_single_subscription_tier` на `subscriptions`: при INSERT/UPDATE на ред с `status IN ('active','trialing','past_due')`, ако user-ът има активна team membership (owner или member) → reject (или обратно — виж §5).
- Изтриване на pending teams (запазваме IM-Development):
  ```sql
  DELETE FROM teams WHERE status='pending' AND id IN (
    'da4990b2-854b-4fcc-83b1-93fc37d96dd2',
    '5c2e2c38-564c-4639-b3a3-cd2803e8544c',
    '7f009d84-4fda-4235-b58c-5279520ea296',
    '6d9488fe-b560-4cd5-a8cc-72753f3aa450'
  );
  ```
  (cascade ще махне `team_members` / `team_invitations` за тях.)

## 3. Stripe products / prices

Нови `lookup_keys`:
- `professional_monthly` = 12.90 € (reuses old `pro_monthly` стойност — създаваме нов lookup key, оставяме стария за legacy webhooks)
- `professional_yearly` = 129 € (reuses `pro_yearly`)
- `entrepreneur_monthly` = 19.90 € (нов price + product)
- `entrepreneur_yearly` = 199 € (нов price)
- `team_yearly` = 109 € (без промяна, quantity 3–100)
- **Архивира се** `team_monthly` (Stripe `active=false`).

FIRST100 купони (`first100_monthly`, `first100_yearly`) се пре-вписват с `applies_to.products` = новите professional + entrepreneur продукти.

## 4. Code: plan mapping & caps

- `src/lib/plansData.ts`: `PlanId = "free" | "professional" | "entrepreneur" | "team"`, обновени `PLANS`, `COMPARISON_ROWS`, `FAQ`. Team има само yearly колона.
- Helper `src/lib/planTier.ts` (нов):
  ```ts
  export type Tier = "free" | "professional" | "entrepreneur";
  export function tierFromPlan(plan: string|null, proUntil: string|null): Tier { … }
  export const OPS_CAP: Record<Tier, number> = { free: 0, professional: 50, entrepreneur: 120 };
  export function isPaid(t: Tier) { return t !== "free"; }
  ```
- `useIsPro.tsx` → разширява се с `tier`, `opsCap` идва от `OPS_CAP[tier]` (или `plan_ops_cap` override за grandfathered).
- Всички `plan === "pro"` чекове в client + edge functions (списък: `Account.tsx`, `Wizard.tsx`, `WizardReview.tsx`, `Document.tsx`, `CheckoutReturn.tsx`, `BlogSubmit.tsx`, `Admin.tsx`, `download-document`, `assistant-chat`, `submit-user-article`, `create-signing-request`, `apply-corrections`, `create-share-link`, `correct-uploaded`) → заменени с `tier !== "free"` (за gating на платени фичи) или `tier === "entrepreneur"` (за премиум-only като GPT‑5 / приоритет).
- Premium-only гейтове в `entrepreneur`:
  - `supabase/functions/assistant-chat` — branch към GPT‑5 модел + priority queue marker.
  - `Account.tsx` — секция „Premium support 24/7" + бутон за onboarding.
- `useTeam.tsx` + Team билинг UI: премахва избор „месечно" — само yearly.
- `create-checkout`: ако `priceId === "team_monthly"` → 400 „Екип е само годишен абонамент".
- `create-team` / `team-update-seats`: задължава yearly price; ако активен Pro/Entrepreneur subscription у потребителя → 409 + ясно съобщение.

## 5. Overlap handling (Pro/Entrepreneur ↔ Team)

User answer: при конфликт **отказваме Team, оставяме индивидуалния абонамент**.

- DB trigger при `INSERT` в `team_members`: ако user_id има активен ред в `subscriptions` (professional/entrepreneur) → raise exception.
- При `INSERT/UPDATE` в `subscriptions` (active) → ако user е в активен team като член (non-owner) → автоматично го махаме от `team_members`; ако е owner → cancel team чрез edge function.
- В UI на /plans: ако имаш активен Pro/Entrepreneur, бутонът „Купи Екип" е disabled с tooltip „Откажи индивидуалния абонамент първо".
- Понеже в момента **няма** реални overlapping users (проверено: само IM-Development team + един `pro_monthly` user различен от team members), не се прави масово отказване — само превенция занапред.

## 6. Files to edit

```
src/lib/plansData.ts                      — нови планове/копи
src/lib/planTier.ts                       — нов
src/hooks/useIsPro.tsx                    — tier + opsCap от helper
src/hooks/useTeam.tsx                     — yearly-only
src/pages/Account.tsx                     — UI копи, ops cap, премиум секция
src/pages/Plans.tsx (или Pricing)         — нови карти + само yearly за Team
src/pages/Wizard.tsx, WizardReview.tsx    — tier чекове
src/pages/Document.tsx, CheckoutReturn.tsx, BlogSubmit.tsx, Admin.tsx
src/components/ProUpgradeDialog.tsx       — нови tier-and / CTA
src/components/FreeOpsChip.tsx            — копи (без промяна на логика)
supabase/functions/create-checkout        — забрана team_monthly, нови lookup keys
supabase/functions/create-team, team-update-seats, team-invite — yearly only + overlap guard
supabase/functions/{assistant-chat,download-document,submit-user-article,
  create-signing-request,apply-corrections,create-share-link,correct-uploaded}
                                          — tier-aware gating
src/integrations/supabase/types.ts        — авто-регенерира се след миграцията
.lovable/memory/index.md + plan-names.md — нови цени/имена
```

## 7. Stripe / data ops (build phase, sequential)

1. Migration: enum + plan_ops_cap + triggers + DELETE pending teams.
2. `batch_create_product` за `professional_*` и `entrepreneur_*`, archive `team_monthly`.
3. Code edits.
4. UPDATE `download_quota` за grandfathering (existing pro → professional, cap=100 grandfathered).
5. Update memory.
6. Verify: `bunx vitest run src/test/pricing.test.ts src/test/quota.test.ts`.

## 8. Out of scope

- Не пипаме сегашната Stripe subscription на единствения активен Pro потребител (`b88a3de0…`) — той автоматично става „Професионалист" с grandfathered cap 100 до края на периода; ще получи нотификация при подновяване.
- IM-Development team не се пипа.
- FIRST100 промо логиката остава, само applies_to сменя продуктите.
