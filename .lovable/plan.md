## Цел

Превърни Free плана от „проба и спри" в постоянна, ангажираща витрина. Всеки месец потребителят получава скромна квота операции **плюс** ограничен достъп до най-силните PRO функции: AI Асистент, анализ с risk report, авто-корекции, **комплекти документи** и **двуезични договори** (единствените премиум документи). Това създава ясна нужда от абонамент.

В Account: премахни втората (all-time) графика и комбинирай показателите в съществуващата 30-дневна графика чрез KPI badge-ове.

---

## Част 1 — Нов Free план

### Месечни квоти (нулиращи се на 30 дни, без lifetime)
- **3 операции/месец** (сваляне на договор/шаблон или анализ на качен)
- **5 съобщения/месец** към AI Асистент
- **1 анализ на качен договор/месец** — пълен текст, но risk report и детайлите по находките са замъглени (виждат се само score + брой)
- **Авто-корекции preview** — само първите 2 предложения от всяка вълна
- **1 двуезичен договор/месец** в preview — BG колоната е видима, EN колоната е замъглена, downloads disabled (отключи с PRO)
- **1 комплект/месец** — Free може да създаде/види progress на 1 активен kit; реалното сваляне на документите от kit-а консумира от 3-те месечни оп.
- **Watermark** „Изготвено с Dogovori.net" в footer-а на безплатно сваляните PDF/DOCX

### PRO/Team (без промяна)
100 операции/месец, неограничен AI Асистент в рамките на cap-а, пълни risk reports, всички корекции, неограничени kits, всички двуезични договори с download, без watermark.

### Какво пада
- 6 lifetime + 2/мес и `bonus_contracts` lifetime логиката → чист 3/мес модел.
- Hard paywall за качване/анализ, AI Асистент, kits, bilingual → заменени с teaser.
- Концепцията „премиум документи" — отпада. Само `bilingual=true` документи са премиум.

---

## Част 2 — Account графики

- **Премахни** секцията „All-time извършени операции" (lines 540–576 в `src/pages/Account.tsx`) + derived `allTimeData`.
- В „Активност (последни 30 дни)" добави в горния десен ъгъл два малки KPI badge-а:
  - `Този месец: {30dOps}` (gold border)
  - `Общо: {totalOps}` (muted border)
- Threshold линиите за loyalty (1k/5k/15k) преместване като прогрес в Loyalty rewards секцията.

---

## Технически детайли

### Backend (миграция)

1. `consume_quota(_kind)` — пренаписване: Free → `monthly_total_used < 3` allow, иначе `quota_exceeded`. PRO без промяна.
2. Нови колони в `download_quota`: `ai_messages_used`, `analysis_previews_used`, `bilingual_previews_used`, `kit_slots_used`, `monthly_features_reset_at`.
3. Нови RPC функции:
   - `consume_ai_message()` — Free 5/мес.
   - `consume_analysis_preview()` — Free 1/мес, връща `{tier: 'free_preview' | 'full'}`.
   - `consume_bilingual_preview()` — Free 1/мес (само за preview сесия; reset feature counters при 30d roll).
   - `can_use_kit_slot()` — Free 1 активен kit.
4. `handle_new_user()` — обновен welcome текст с новата квота.

### Frontend

- `useIsPro` → разшири с `freeQuota: { ops, aiMessages, analysisPreview, bilingualPreview, kitSlots }`.
- `FloatingAssistant` — брояч „Остават X/5 безплатни съобщения" + paywall при изчерпване.
- `RiskReport` — Free blur overlay върху findings 3+, показва score + count + CTA.
- `CorrectionsPanel` — заключва корекции 3+ за Free.
- `WizardBilingual` / wizard в bilingual режим — за Free замъглява EN колоната в `ContractPreview` и блокира download бутона; PRO badge на bilingual карти в каталога/SectorGrid.
- `Kits.tsx` / `KitDetail.tsx` — Free 1 активен kit slot; CTA „Активирай PRO за повече комплекти".
- `BuildContract.tsx`, `Category.tsx`, `SectorGrid.tsx`, `TopDocuments.tsx` — добавяне на gold „PRO • Двуезичен" badge на bilingual документи.
- `downloadDocument.ts` / `signedPdfAssembler.ts` — watermark footer за Free.
- `correct-uploaded` edge function — Free режим връща risk findings с `obscured: true` за всичко след първите 2 и опростен summary.
- Pricing / Hero / AssistantPaywall copy — обновени с новите Free бенефити (изтъкване „безплатно всеки месец, без карта").

### Account.tsx промени
- Изтриване на блока „All-time извършени операции" (lines 540–576).
- В header-а на 30-дневната графика — flex редичка с 2 KPI чип-а.

---

## Файлове за промяна

```text
supabase/migrations/<new>.sql                 — нови функции и колони
src/pages/Account.tsx                         — премахване all-time + KPI badges
src/hooks/useIsPro.tsx                        — разширен free quota state
src/components/FloatingAssistant.tsx          — 5/мес брояч
src/components/AssistantPaywall.tsx           — нов copy
src/components/wizard/RiskReport.tsx          — Free blur layer
src/components/wizard/CorrectionsPanel.tsx    — Free 2-corrections lock
src/components/wizard/ContractPreview.tsx     — bilingual EN blur за Free
src/pages/WizardBilingual.tsx, WizardGraph    — bilingual preview gate
src/pages/Kits.tsx, KitDetail.tsx             — 1 kit slot за Free
src/pages/BuildContract.tsx, Category.tsx,    — PRO badge на bilingual карти
  src/components/SectorGrid.tsx, TopDocuments.tsx
src/lib/downloadDocument.ts                   — watermark footer
src/lib/signedPdfAssembler.ts                 — watermark footer
supabase/functions/correct-uploaded/index.ts  — Free obscured findings
src/pages/Index.tsx, Hero, pricing copy       — нови Free бенефити
```

---

## Извън обхвата
- Промени по Team плана и цени.
- Stripe продукти, loyalty tier-и.
