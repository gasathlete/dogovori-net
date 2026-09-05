# Entitlement audit: what the 2.90 € "5 операции" pack really gives (HEAD 879c3834)

Read-only audit. No code, Stripe, migration, deploy or data change was made.

## 1. Entitlement matrix (evidence)

| Capability | Granted by the 2.90 € pack? | Evidence |
|---|---|---|
| +5 operations on the account balance | Yes | `supabase/functions/_shared/oneoff-credit.ts` (`ENTRY_PACK_OPS = 5`, `planOneOffCredit`) → `payments-webhook/handlers.ts` line ~275 calls RPC `credit_topup_ops`, which raises `download_quota.topup_ops_balance` |
| Operations expire | No — they persist | `credit_topup_ops` only increments `topup_ops_balance`; `consume_quota` monthly reset zeroes `monthly_*` counters only (`migrations/20260710173858_*.sql`) |
| Operations spendable on contracts, templates, analysis | Yes, but only after the monthly free cap is used up | `consume_quota` spends `monthly_total_used` first; `topup_ops_balance` is the fallback branch |
| Watermark-free download | Only on downloads actually paid from the pack | `download-document/index.ts:233` `watermark = !isPro && !useBonus && !bonusAvailable`; `useBonus` comes from `consume_quota` `used_bonus`, true only for the topup/bonus branch. So while free monthly ops remain, a paying user still gets watermarks; re-downloads (line 84) ignore `topup_ops_balance` entirely and always watermark non-Pro users |
| Strict-document unlock (wizard contract), 24 h | Yes, when bought from the wizard paywall | `create-strict-unlock-checkout` sets `type: strict_doc_unlock` + `doc_key`; webhook upserts `strict_doc_unlocks` with `expires_at = +24h` |
| "Unlimited downloads for 24 h" of that document | No | `download-document/index.ts:141-157` only lifts the 402 gate; every download after that still calls `consume_quota` and is watermarked unless it draws from the pack. Once ops run out the download fails |
| Bilingual full output, full risk report, AI assistant beyond free cap, e-signature extras, branding/logo, premium templates, any "Предприемач" feature | No | Every gate reads `isPro` / `isEntrepreneur` / `isProfessional`, derived from `download_quota.plan` / `pro_until` / subscription `price_id` (`src/hooks/useIsPro.tsx`), never from `topupBalance`. Gates: `RiskReport.tsx`, `AssistantPaywall.tsx`, `Assistant.tsx`, `useBranding.tsx`, `SignatureBlock.tsx`, `useDocumentAccess.ts` |
| Anything read from `topupBalance` client-side | Only "can I still act" hints | `BuildContract.tsx:1571`, `Wizard.tsx:828` (`opsLeft`), `useIsPro.tsx:137` |
| New free registration | 5 ops during the first 30 days, then 2 per month (a cap, not a cumulative bonus) | `consume_quota`: `IF now() - signup_at < interval '30 days' THEN cap := 5 ELSE cap := 2`; mirrored in `useIsPro.tsx` |

Net: the paid pack is **operations only**, plus (in the wizard flow) a 24 h strict-document unlock. Its face value (5 ops) is identical to the free signup grant (5 ops), so the offer reads as "pay 2.90 € for what registration gives away".

Also worth flagging before release: `supabase/migrations/20260905060000_credit_topup_ops_hardening.sql` carries an in-file note that it is prepared but **not applied**, so the fail-closed crediting behaviour it describes is not live yet.

## 2. Copy that over-promises or blurs paid vs free

1. `src/pages/account/SubscriptionTab.tsx:213` — "5 операции по избор, всички функционалности на „Предприемач“" — false; no Entrepreneur feature is unlocked.
2. `src/pages/account/SubscriptionTab.tsx:214` — "Без воден знак" — true only for downloads charged to the pack; false while free monthly ops remain and false for re-downloads.
3. `src/components/wizard/StrictDocumentPaywall.tsx:172-175` — "Документът се отключва за 24 часа (неограничени сваляния в PDF и DOCX)" — each download still costs an operation and can be watermarked; unlimited is not true.
4. `src/pages/Plans.tsx:430-436` + `src/pages/account/SubscriptionTab.tsx:643-649` — "5 операции за 2,90 €" with no differentiator next to the free plan's own 5 ops; ambiguous value.
5. `src/pages/Plans.tsx:477`, `src/lib/planCategories.ts:155`, `src/components/ProUpgradeDialog.tsx:62`, `src/pages/Template.tsx:142`, `src/components/BetaDisclaimerModal.tsx:190` — "5 операции при регистрация + 2 всеки месец" reads as additive (7 in month one); the real rule is a 5-op cap for 30 days, then 2/month.
6. `src/pages/legal/Terms.tsx:88` — "5 операции — 2,90 € еднократно" is factually right but the Terms never state that the pack grants no features, while the marketing pages imply feature access.
7. `supabase/functions/download-document/index.ts:137` — stale internal comment "one-off unlock (0.40€)".

## 3. Recommendation — smallest safe change before release

Choose honest copy, not new backend entitlements. Backend feature-granting would mean touching `consume_quota`, every `isPro` gate and the watermark decision — high risk right before a release.

Proposed minimal, source-only change set (copy + one truthful watermark fix):

- Rewrite `oneOffFeatures` to: "5 допълнителни операции", "Без абонамент · не изтичат", "Използват се след месечните безплатни операции". Remove the Entrepreneur claim and the unqualified "Без воден знак".
- Strict paywall: replace "неограничени сваляния" with "отключва документа за 24 часа; всяко сваляне ползва една операция".
- Differentiate the pack from the signup grant everywhere it is sold: label it "Допълнителни операции" / "+5 операции към профила", not just "5 операции".
- Fix the additive "+2 всеки месец" phrasing to "5 операции за първите 30 дни, след това 2 на месец" in the five listed files.
- Update Terms to state explicitly that one-off packs grant operations only, no plan features.
- Optional, still low risk and it makes bullet 2 true: in `download-document`, treat an active `topup_ops_balance` the same as `bonus_contracts` when deciding the re-download watermark, so a user who paid is not watermarked on repeat downloads.
- Separately decide whether to apply the prepared `credit_topup_ops` hardening migration before taking live traffic.

Not included on purpose: no change to `consume_quota` spend order, no new feature unlocks, no Stripe changes.
