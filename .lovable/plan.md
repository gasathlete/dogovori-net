
# Workspace за свързани документи (Приложение 1, ППР, Анекс и др.)

## Цел

Когато генерираният договор споменава приложение или друг препоръчан документ (Приложение 1 — опис на имущество, Приемо-предавателен протокол, Анекс, Декларация, Пълномощно и др.), потребителят да може да отвори **split-view workspace**:

- **Ляв панел** — вече създаденият основен документ (read-only preview).
- **Десен панел** — новият документ, който трябва да се създаде, с бутон **„Изготви документ"** който подава контекста от левия документ към AI.

## Потребителски поток

1. В `WizardReview` (след генериране) под договора се показва секция **„Свързани документи"** — чипове/карти за всеки открит референс (Приложение 1, ППР, Декларация…).
2. Клик върху карта → навигация към `/workspace/:parentDocId/:childKind` (нов route).
3. Workspace-ът зарежда левия панел от `saved_documents` (или ако е гост — от sessionStorage snapshot), десният показва:
   - Заглавие на предложения документ,
   - Кратко обяснение защо е нужен,
   - Prefilled полета извлечени от родителския договор (страни, дата, предмет, референтен номер),
   - Бутон **„Изготви документ"** → извиква `generate-linked-document` edge функция.
4. След генериране десният панел показва готовия документ с action bar (Свали / Запази / Отвори в wizard).
5. Готовите свързани документи се записват в `saved_documents` с `parent_document_id` за да могат да се преоткриват от workspace-a.

## Технически детайли

### Backend

- **Нова колона в `saved_documents`**: `parent_document_id uuid null` + `linked_kind text null` (напр. `"appendix_1"`, `"handover_protocol"`, `"annex"`, `"declaration"`, `"power_of_attorney"`).
- **Нова edge функция `detect-linked-documents`** (или интегрирано в `generate-contract`): след като договорът е генериран, малък AI pass извлича масив `linked_documents: [{kind, title, reason, prefill}]` — това се връща заедно с `risk` и `contract`.
- **Нова edge функция `generate-linked-document`**:
  - Вход: `parent_document_id` (или сериализиран parent body), `kind`, `overrides`.
  - Системен промпт специфичен за вида (Приложение 1 — таблица с описание/състояние/бр./ст-ст; ППР — дати, страни, състояние; Анекс — препратка към клауза от основния договор и т.н.).
  - Използва контекст от родителя (страни, дата на сключване, референции към членове) и връща същата JSON схема `{contract:{title, preamble, clauses, closing}}`.
  - Същата GDPR/redaction/rate-limit/quota логика като `generate-contract` (1 op).

### Frontend

- **Нов route** `src/pages/DocumentWorkspace.tsx`:
  - Layout: `ResizablePanelGroup` с два панела (`shadcn/ui` resizable).
  - Ляв: `<ContractPreview readOnly>` заредено от родител.
  - Десен: празно състояние с описание + бутон „Изготви документ"; след генериране — `<ContractPreview>` с action bar.
  - Sticky header със заглавието на родителя и breadcrumb.
  - Mobile fallback: tabs вместо split.
- **Нов компонент `LinkedDocumentsSection`** в `WizardReview` — рендерира чиповете с иконки и кратко описание.
- **Каталог на видовете** `src/lib/linked-document-kinds.ts` — статичен списък с label/description/icon/systemPromptId за всеки поддържан вид (appendix_1, handover_protocol, annex, declaration, power_of_attorney, invoice_template, notice).
- **Хук `useLinkedDocuments(parentId)`** — зарежда родителя + децата от `saved_documents`.

### Гости (без акаунт)

- За гости parent-ът се държи в `sessionStorage` под `dogovorinet:draft:<slug>`; детето също се държи в session до момент на сваляне (paywall / login).

### Билинг

- Всяко генериране на свързан документ = 1 op (същата логика като основното `generate-contract`).
- В workspace UI-а показваме „Ще използва 1 операция" преди клик.

## Извън обхвата (за по-късно)

- Едновременно редактиране (real-time collab).
- Автоматично свързване на подписи (signing) на всички документи в workspace-a — само линкове засега.
- Bulk export на всички свързани документи в ZIP — отделна задача.

## Файлове за създаване/промяна

- `supabase/migrations/<ts>_add_linked_documents.sql` — колони + индекс.
- `supabase/functions/generate-contract/index.ts` — добавя `linked_documents` в отговора (small extra AI pass или част от съществуващия JSON schema).
- `supabase/functions/generate-linked-document/index.ts` — нова функция.
- `src/lib/linked-document-kinds.ts` — каталог.
- `src/hooks/useLinkedDocuments.ts` — data hook.
- `src/pages/DocumentWorkspace.tsx` — нов route.
- `src/components/wizard/LinkedDocumentsSection.tsx` — секция в review.
- `src/pages/WizardReview.tsx` — вгражда секцията.
- `src/App.tsx` — регистрира новия route.
