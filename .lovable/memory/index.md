# Project Memory

## Core
Currency is EUR only. BGN/лв/lev no longer used anywhere.
Tiers (BG): **Безплатен / Професионалист / Предприемач / Екип**. Предприемач е НАЙ-премиум планът (НЕ среден).
Pricing:
- Професионалист: 12.90 €/мес или 129 €/год (≈10.75 €/мес), **50 операции/мес**. Stripe lookup_keys: `professional_monthly`, `professional_yearly`. Legacy `pro_monthly`/`pro_yearly` (12.90 €/129 €) се третират като Професионалист — за grandfathered абонати.
- Предприемач: 19.90 €/мес или 199 €/год (≈16.60 €/мес), **120 операции/мес**. Stripe lookup_keys: `entrepreneur_monthly`, `entrepreneur_yearly`. Features над Професионалист: GPT-5 + приоритетна AI обработка, Premium support 24/7, персонален onboarding, ранен достъп.
- Екип: **САМО годишно**, 109 €/seat/год, мин. 3 = 327 €/год, 100 ops/seat/мес. Stripe lookup_key: `team_yearly`. `team_monthly` е премахнат — create-checkout връща 400.
- One-off: 2.90 € за 5 операции (`five_operations`).
VAT 20% inclusive. FIRST100: 30% monthly / 40% yearly (recurring only).

Constraint: един потребител не може едновременно да е индивидуален абонат (Професионалист/Предприемач) И член/owner на екип. DB triggers `enforce_no_team_when_subscribed` (BEFORE INSERT на team_members) и `cleanup_team_on_subscription` (AFTER INSERT/UPDATE на subscriptions) гарантират това. Единственият запазен екип е **IM-Development** — pending дубликати са изтрити.

Grandfathering: `download_quota.plan_ops_cap` (NULL = default cap от tier; ако е числено — override). Текущите Pro абонати (price_id=pro_monthly/yearly) са с cap=100 grandfathered.

Tier helper: `src/lib/planTier.ts` (`tierFromPriceId`, `OPS_CAP`, `TIER_NAME`). `useIsPro` връща правилния opsCap.

Operation metering: 1 op = (download contract) | (download template) | (upload+analyze incl. auto-corrections wave). Same (session_id, doc_key) в таб = free. Нова корекционна вълна (нов batch_id) = 1 op.

## Memories
- [Plan names](mem://plan-names) — BG display names (deprecated — superseded by Core)
