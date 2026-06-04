# Freemium Wave 2 — Implementation Plan

Continuing from Wave 1 (quota backend + Account KPI + AI gating done). This wave covers the remaining gates.

## 1. Bilingual contracts (the only "premium" doc type)
- `src/pages/WizardBilingual.tsx` + `src/components/wizard/ContractPreview.tsx`: for Free users, blur the EN column with an overlay "Само за PRO — отключи двуезичен договор" + upgrade CTA. Allow 1 preview/mo via `consume_bilingual_preview`. Disable EN download button.
- `src/pages/BuildContract.tsx`, `src/components/SectorGrid.tsx`, `src/components/TopDocuments.tsx`: add small "PRO" badge on bilingual templates.
- Free download attempt → upgrade modal.

## 2. Risk analysis preview (1/mo, blurred details)
- `src/components/wizard/RiskReport.tsx`: Free users see summary score + first finding clearly; remaining findings blurred with lock overlay "PRO отключва пълния risk report".
- Gate the analyze action via `consume_analysis_preview` (1/mo).

## 3. Auto-corrections preview (first 2 only)
- `src/components/wizard/CorrectionsPanel.tsx`: show first 2 corrections, rest behind blur + "Отключи всички корекции с PRO".
- `supabase/functions/correct-uploaded/index.ts`: for Free users return all findings but mark `locked:true` on items beyond index 1 (truncate detail text). Or return full and let UI gate — simpler. Plan: UI-only gate, server returns full, UI hides.

## 4. Kits (1 active slot for Free)
- `src/pages/Kits.tsx`: check `can_use_kit_slot` before allowing create; show "1/1 използван — PRO дава неограничени комплекти" when full.

## 5. Watermark on free downloads
- `src/lib/downloadDocument.ts` + `src/lib/signedPdfAssembler.ts`: when user is not PRO, append footer "Изготвено с Dogovori.net — надгради до PRO за чисти документи" on each page.

## 6. Pricing/Hero copy refresh
- `src/components/Hero.tsx` + pricing section: reflect new Free tier (3 ops/mo + teasers) instead of old wording.

## Files touched
WizardBilingual.tsx, ContractPreview.tsx, BuildContract.tsx, SectorGrid.tsx, TopDocuments.tsx, RiskReport.tsx, CorrectionsPanel.tsx, Kits.tsx, downloadDocument.ts, signedPdfAssembler.ts, Hero.tsx, pricing copy.

## Out of scope (later wave)
- Server-side enforcement of watermark / corrections lock (currently UI-only; PRO bypass via `useIsPro`).
- Telemetry on paywall impressions.

Confirm and I'll implement all of the above in one pass.