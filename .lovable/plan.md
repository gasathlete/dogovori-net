## Цел

Изграждащият wizard в `/build` да адаптира полетата си спрямо избрания вид документ. Заглавие и Категория се запазват винаги. Страните остават, но с подходящи етикети (вече има в backend — ще се огледа и в UI). Всички останали полета (предмет/срок/цени/задължения/други) се заменят с per-type схема.

## Решение

Едностраничен wizard, същият layout — но средната секция („Предмет / Срок / Цени / Задължения / Други") се рендира динамично от схема за избрания вид.

### 1. Нов файл: `src/lib/documentFieldSchemas.ts`

Една схема на вид документ:

```ts
type FieldKind = "input" | "textarea";
interface BuildField {
  key: string;           // напр. "amount_or_item"
  label: string;         // „Сума или вещ"
  placeholder?: string;
  help?: string;         // под етикета
  hint?: string;         // дясно над полето (напр. „празно → AI предлага")
  kind: FieldKind;
  rows?: number;         // за textarea
  required?: boolean;
  half?: boolean;        // ако е true → 2 колони (sm:grid-cols-2)
}
interface DocumentBuildSchema {
  partyALabel: string;        // напр. „Възложител" / „Декларатор"
  partyBLabel?: string;       // празно/липсва → едностранен
  partyAPlaceholder?: string;
  partyBPlaceholder?: string;
  fields: BuildField[];       // в реда, в който се показват
}
```

Конкретни схеми (примери — пълните се изготвят при имплементация):

```text
contract / agreement   → subject, term+prices (half), obligations, other
appendix               → parent_ref, subject, specs, term+prices (half)
annex                  → parent_ref, changed_clauses, effective_date, reason
protocol               → object, location_date (half), findings, defects, acceptance
receipt                → amount_or_item, basis, place+date (half)
power_of_attorney      → scope, term, substitution_right, notarial_required
declaration            → declared_text, legal_basis, criminal_liability_note
complaint              → addressee, against, relating, facts, legal_grounds, request, attachments
claim                  → court, claim_value, legal_basis, circumstances, evidence, petitum, attachments, state_fee
notary_invitation      → basis, demand, deadline, consequences
offer                  → subject, specs, price_vat, validity, payment_terms
invoice                → supplier_details, recipient_details, items, vat_rate, payment_method
smr                    → object, work_types, technology, term, value, quality_warranty
kss                    → positions (голям textarea с таблично описание), totals_note
```

### 2. Рефакторинг на `src/pages/BuildContract.tsx`

- Заменяме отделните `useState` за `subject/term/prices/obligations/other` с един `Record<string,string>` (`fieldValues`).
- LocalStorage payload: добавяме `fieldValues` (и пазим обратна съвместимост — ако се срещне стар запис със subject/term/etc., се мапва към съответните ключове).
- Премахваме hardcoded „Възложител/Изпълнител" текстовете и ги взимаме от `schema.partyALabel/partyBLabel`. `needsParties` остава, но базиран на наличието на `partyBLabel`.
- Когато потребителят смени `documentType`, fieldValues се запазват по ключ (не се триват) — общи ключове (напр. `subject`) автоматично се пренасят, специфичните ключове за стария вид остават в storage, но не се визуализират.
- Рендериране: вместо текущия фиксиран блок „Предмет → Срок/Цени → Задължения → Други" итерираме `schema.fields` и групираме съседните `half:true` в `sm:grid-cols-2`.
- Validation: само `required: true` полетата от схемата + Заглавие + Категория + Страни (при двустранен).

### 3. Payload към edge function

В `supabase.functions.invoke("build-custom-contract")` изпращаме:

```ts
body: {
  // ...съществуващите полета
  customFields: schema.fields.map(f => ({
    key: f.key, label: f.label, value: fieldValues[f.key] ?? ""
  })),
  // запазваме subject/term/prices/obligations/other като алиаси
  // когато съществуват в схемата (backward-compatibility за кеша)
}
```

### 4. Edge function `supabase/functions/build-custom-contract/index.ts`

- В `BuildPayload` добавяме `customFields?: { key: string; label: string; value: string }[]`.
- Userprompt: вместо твърдо изброените „ПРЕДМЕТ/СРОК/...", итерираме `customFields` и рендираме секции `[LABEL]: value` (пропускаме празните и казваме „(не е посочено — измисли подходящо)" за тях). Поведението при липсващ `customFields` пада обратно към текущите subject/term/...
- `cacheKeyInput`: добавяме `customFields`; вдигаме `PROMPT_VERSION` на `v4-perTypeFields`.
- `document-types.ts` (server): остава както е (вече има per-type systemAddendum). Опционално: добавяме `expectedFields: string[]` като намек към AI кои полета са най-важни, но не е задължително.

### 5. Без промени

- BUILD_MODES (Бърз/Разширен/Стриктен) — остават.
- DocumentType grouped chips selector — остава.
- Risk meter, corrections panel, signature block, export — без промяна.

## Технически детайли

Файлове:
- new `src/lib/documentFieldSchemas.ts` — схемите + helper `getBuildSchema(id)`
- edit `src/pages/BuildContract.tsx` — динамично рендериране, fieldValues map, обновени party labels
- edit `supabase/functions/build-custom-contract/index.ts` — customFields → user prompt, v4 cache key
- (по желание) edit `supabase/functions/_shared/document-types.ts` — добавяне на expectedFields

Без миграции, без нови dependencies.

## Извън обхвата

- Stepper (multi-step) wizard — оставаме single page.
- Реални таблични UI компоненти за КСС/Фактура (позициите остават като структуриран textarea).
- Промяна на default party labels на server-а — те вече са правилни; UI ще се изравни.
