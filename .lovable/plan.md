
# План: Приходно-разходни сценарии (Admin)

Нов раздел `/admin/financials` — интерактивен P&L модел с три сценария, базиран на текущите планове и реалните Lovable AI Gateway цени.

## 1. Базови допускания (constants, редактируеми в UI)

### Приходи / план (EUR, без ДДС след отделяне на 20%)
| План | Цена бруто | Нето / месец | Ops/мес |
|---|---|---|---|
| Free | 0 | 0 | 2 (+5 еднократно) |
| Професионалист | 12.90 | 10.75 | 50 |
| Предприемач | 19.90 | 16.58 | 120 |
| Екип (3 места) | 327 €/год | 22.71 / мес | 300 (3×100) |

Top-up (нето): 2.42 / 4.50 / 10.75 / 19.92.

### Разход / 1 операция (mix по типове)
Допускания за tokens средно на op:
- Изготвяне на договор: ~6k in / 4k out
- Анализ на качен договор: ~12k in / 3k out + OCR (~0.5 страници)
- Изтегляне на шаблон: 0 AI
- AI асистент съобщение: ~2k in / 0.8k out

Цени Gemini Flash / Pro / GPT-5 — четат се от `ai_simulation_settings.model_prices` (вече има админ UI), плюс OCR + embeddings constants. Така една промяна в settings опреснява и сценариите.

Routing per план:
- Free/Професионалист → 100% Gemini 2.5 Flash
- Предприемач → 60% Gemini Pro + 40% GPT-5
- Екип → 80% Gemini Pro + 20% GPT-5

### Фиксирани разходи / месец (input полета)
Lovable hosting & Cloud, домейн, имейл (Resend), Stripe такси (2.9% + 0.30 €), счетоводство, маркетинг бюджет, резерв.

## 2. Трите сценария (mix + мащаб)

| Сценарий | Активни юзъри | Free | Проф. | Предпр. | Екип (мин 3 места) | Top-up attach |
|---|---|---|---|---|---|---|
| Консервативен | 500 | 88% | 9% | 2.5% | 0.5% (1 екип) | 5% от платените |
| Базов | 2 500 | 80% | 14% | 5% | 1% (8 екипа) | 12% |
| Оптимистичен | 8 000 | 70% | 20% | 8% | 2% (53 екипа) | 22% |

Allowance utilization (% от месечния cap, който реално се изконсумира): 35% / 55% / 70%.

## 3. Изчисления

За всеки сценарий:
1. **MRR нето** = Σ (users × нето цена) + top-up нето.
2. **AI cost** = Σ за всеки план: ops_used × blended_cost_per_op (в EUR, по token pricing × routing mix) + OCR.
3. **Stripe fees** = 2.9% × бруто + 0.30 € × брой плащания.
4. **Gross margin** = (MRR − AI cost − Stripe fees) / MRR.
5. **Net profit** = Gross − fixed costs.
6. **Unit economics**: ARPU, COGS/user, contribution margin, payback при CAC=8/15/30 €.

## 4. UI / Компоненти

- `src/pages/AdminFinancials.tsx` — guard през `useUserRole('admin')`.
- `src/lib/financials/assumptions.ts` — defaults + типове.
- `src/lib/financials/scenarios.ts` — pure функции `computeScenario(inputs)` (тестваеми с vitest).
- `src/components/admin/financials/ScenarioCard.tsx` — KPI grid (MRR, ARR, AI cost, Net, Margin %).
- `src/components/admin/financials/AssumptionsPanel.tsx` — collapsible sliders/inputs за mix, utilization, fixed costs, token cost overrides.
- `src/components/admin/financials/CostBreakdownTable.tsx` — таблица по план: users, ops, AI €, Stripe €, нетна вноска.
- `src/components/admin/financials/ScenarioCompareChart.tsx` — bar chart (recharts вече е в проекта) сравняващ трите.
- Export: бутон „Свали като CSV" (`src/lib/csv.ts` вече съществува).

Routing: добавя се `/admin/financials` в `src/App.tsx` под admin guard; линк в съществуващото admin меню.

## 5. Тестове

`src/test/financials.test.ts` — проверки:
- Базовият сценарий дава MRR в рамките на ±1% от ръчно сметнатата стойност.
- При 0 потребители всички разходи = fixed.
- Промяна на token цена → пропорционална промяна на AI cost.

## 6. Какво НЕ влиза в обхвата

- Без писане в БД — всичко е client-side калкулация.
- Без промени по публични страници, ценообразуване, Stripe продукти.
- Без интеграция с реални Stripe/Supabase агрегати (отделна задача — може после да заменим mock-а с `ai_usage` агрегация).

## Очакван резултат (preview числа, ще се валидират в кода)

| | Консервативен | Базов | Оптимистичен |
|---|---|---|---|
| MRR нето | ~210 € | ~1 850 € | ~9 400 € |
| AI cost | ~35 € | ~330 € | ~1 750 € |
| Stripe fees | ~8 € | ~70 € | ~360 € |
| Fixed | ~280 € | ~450 € | ~1 100 € |
| **Net / мес** | **−113 €** | **+1 000 €** | **+6 190 €** |
| Gross margin | ~80% | ~78% | ~77% |

Числата са илюстративни — точните стойности ще се изчислят от модула при build.
