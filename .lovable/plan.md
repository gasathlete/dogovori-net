# План: Поправки на wizard flow + мобилен UX

## 1. „Анализирай и създай" не отчита операция
**Файл:** `supabase/functions/generate-contract/index.ts`
- След успешен AI отговор, извикване на `consume_quota_session('analysis', doc_key, session_id)` с JWT клиент на потребителя.
- При 402 `quota_exceeded` връща структурирана грешка с CTA към paywall.
- Използва `getOpSessionId` и `getOpDocKey` от `WizardReview`, за да не таксува повторно същия документ в същата сесия.

## 2. Документът не отива автоматично в профила
**Файл:** `src/pages/WizardReview.tsx`
- Авто-INSERT в `saved_documents` (status: чернова) след `runAnalysis` и след всяка вълна корекции.
- Бутонът „Запиши в профила" става „Обнови запазеното" с toast нотификация.
- Сортирането в Account вече е DESC — без промяна.

## 3. „Приложение №…" без UX да се създаде
**Нови файлове:**
- `src/lib/detectAppendixReferences.ts` — regex върху текста на договора (намира „Приложение №1", „Анекс №2" и др.).
- `src/components/wizard/AppendixSuggestions.tsx` — карта с откритите приложения и CTA „Създай това приложение" → нов wizard със същия session_id и предварително попълнен контекст.

## 4. Мобилен UI на финализацията — нов ред
**Файлове:** `src/pages/WizardReview.tsx`, `src/components/wizard/CorrectionsPanel.tsx`, `src/components/wizard/ContractPreview.tsx`

Подреждане отгоре надолу (мобилен; desktop разширява всички):

1. **RiskMeter** — sticky отгоре с риск score
2. **Banner „Документът е готов"** + статус на авто-запис („Записан в профила ✓")
3. **AppendixSuggestions** — ако има, изпъкваща карта с CTA
4. **CorrectionsPanel** — свита по подразбиране, hero CTA: „Автоматично подобри документа за 1 операция"
5. **ContractPreview** — collapsible на мобилен, отворен на desktop
6. **RiskReport** — collapsible (детайли по risk score)
7. **Финализиране** (download/share) — collapsible
8. **Disclaimer** най-долу

Маркетингов tone: всяка секция има ясна стойност + CTA. Всички тежки секции като Collapsible на мобилен, отворени на desktop.

## Извън обхвата
- `WizardGraph` (въпросите) — без промени
- Логика на ценообразуване и корекции — без промени, само визуални
