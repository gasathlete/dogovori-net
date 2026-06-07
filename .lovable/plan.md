
# Conversion Loop за Free → Pro

## Принципи
- **Никакво скриване на ценност.** Авто-корекциите и предложенията стават видими за всички. Free вижда какво прави Pro и иска още.
- **Tactical pacing.** Различни pitch-ове на различни моменти от 3-те безплатни операции, плюс след изчерпването им.
- **„Just-in-time" paywall.** Не блокираме нищо предварително — paywall се появява точно в момента, в който потребителят се сблъсква с граница.
- **Multi-channel.** Минимум 6 различни места където системата show-ва Pro оферта в естествен flow, без да дразни.

## 1. Премахване на скриването на корекциите
**Файл:** `src/components/wizard/CorrectionsPanel.tsx`
- Премахваме `blur-sm pointer-events-none` и lock-овете за позиции ≥2.
- Free потребителят вижда ВСИЧКИ issues + recommendations с активни чекбоксове.
- Бутонът „Приложи избраните (N)" работи и за Free, но:
  - Първите 3 пъти (докато има свободни ops) → пуска auto-corrections wave нормално (счита се като 1 op).
  - При нямане на op → бутонът става „Приложи с Pro (N корекции)" и отваря paywall с конкретен ROI: „X корекции готови за прилагане → отключи с Pro".

## 2. Op-aware tease pacing (3 безплатни операции / месец)

`useIsPro` вече дава `opsUsed` / `opsCap`. Въвеждаме `useFreeJourneyStage()` helper в `src/hooks/useFreeJourneyStage.ts`:

```
stage 0 (opsUsed = 0):  „Discovery" — без push, само value showcase
stage 1 (opsUsed = 1):  „Aha"      — soft hint: „1 операция използвана. Pro = 100/мес"
stage 2 (opsUsed = 2):  „Pressure" — конкретен ROI tease: „Остава 1 безплатна. Ето какво пропускаш…"
stage 3 (opsUsed ≥ 3):  „Convert"  — paywall blocking + ясна оферта
```

## 3. Шест канала за tease (placed strategically)

### Канал A — Inline meter в WizardShell sticky header
**Файл:** `src/components/wizard/WizardShell.tsx`
- Малък counter chip „2/3 безплатни операции" → клик отваря Pro модал.
- При stage 2 → chip светва златно с „Остава 1 — виж какво пропускаш".
- При stage 3 → chip → „Изчерпани. Pro = 100/мес".

### Канал B — Post-action celebration toast
**Файл:** нов `src/components/ProConversionToast.tsx` + интегриран в успешен download/analyze.
- След ОПЕРАЦИЯ 1: toast „🎉 Готово! Имаш още 2 безплатни операции."
- След ОПЕРАЦИЯ 2: toast „Това е последната ти безплатна. Pro = 100/мес → 10ст/документ".
- След ОПЕРАЦИЯ 3: toast → меко директен CTA „Беше първите ти 3. Продължи с Pro →".

### Канал C — Corrections Panel ROI banner (на stage 2-3)
**Файл:** `src/components/wizard/CorrectionsPanel.tsx`
- Над списъка добавяме banner: „AI намери N подобрения. С Pro прилагаш неограничено без да харчиш операции."

### Канал D — Risk Report unlock teaser
**Файл:** `src/components/wizard/RiskReport.tsx`
- В дъното на доклада на free: малък card „Pro получава автоматично прилагане на всички N препоръки + auto-monitor при промяна на договора."

### Канал E — Wizard Review sidebar value card
**Файл:** `src/pages/WizardReview.tsx`
- В лявата колона, под RiskMeter, нов компонент `<ProValueCard stage={…} />`:
  - stage 0: hidden.
  - stage 1: „С Pro получаваш…" — 4 bullet-а с икони (100 ops, неогр. корекции, AI асистент, bilingual).
  - stage 2: + reward teaser „Loyalty: 1000 ops = 5% доживот".
  - stage 3: blocker + бутон „Виж плановете" с FIRST100 promo highlight.

### Канал F — Category / Hero contextual nudge
**Файл:** `src/components/Hero.tsx` или нов компонент в Index.tsx над fold за logged-in free.
- Personalized nudge: „Здравей! Използва 2 от 3 безплатни — следващият договор отключи с FIRST100 (30% отстъпка)."
- Само за logged-in free; скрит при logged-out и Pro.

### Канал G (бонус) — Account dropdown badge
**Файл:** `src/components/Header.tsx`
- Малка точка/чип върху avatar-а при stage 2-3 → води към `/account` с подчертан upgrade CTA.

## 4. Paywall модал — единен компонент
**Файл:** нов `src/components/ProUpgradeDialog.tsx`
- Една централна точка с props: `trigger: "corrections" | "ops_exhausted" | "ai_limit" | "bilingual" | "kit_slot" | "generic"`.
- Динамичен copy спрямо trigger (показва какво искаше user-ът + какво Pro прави там).
- Винаги показва FIRST100 promo + reward ladder (gold/platinum/diamond).
- Сравнение Free vs Pro vs Team в кратка таблица.
- 2 CTA: „Pro 12.90 €/мес" + „Pro годишно 129 €" (highlight save).

Замества разпръснатите `onUpgrade` callbacks — всеки досегашен upgrade entry point вика `openProDialog(trigger)`.

## 5. Auto-corrections charging (важно)
- Една wave auto-corrections = 1 op (вече така работи).
- За free потребител на stage 2: преди да го заредим, питаме „Това ще използва последната ти безплатна операция. Продължи?" (lightweight confirm, не paywall).
- На stage 3: вместо confirm → ProUpgradeDialog с trigger="corrections".

## 6. Analytics за измерване
**Файл:** `src/lib/analytics.ts`
- Track events: `tease_shown` (channel, stage), `tease_clicked`, `paywall_shown` (trigger), `paywall_converted`.
- Позволява да A/B тестваме pacing на каналите.

## Извън обхвата
- Backend/Stripe промени (FIRST100 вече съществува).
- Промяна на цените (12.90/129 остават).
- Промени по reward tier-овете.

## Технически детайли (compact)

```text
useFreeJourneyStage()  →  { stage: 0|1|2|3, opsLeft, opsUsed, isPro }
  ↓
WizardShell chip ──┐
CorrectionsPanel ──┤
RiskReport teaser──┼──→ ProUpgradeDialog(trigger)
WizardReview card ─┤
Hero nudge ────────┤
Toast on success ──┘
```
