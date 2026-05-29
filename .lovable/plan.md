## 1. „Вид документ" филтър над категориите (Catalog.tsx)

Нова секция между Hero и sticky nav-а с категории, групирана по 6-те групи от `DOCUMENT_TYPE_GROUPS` (`documentReferences.ts`). Всяка група показва чипове за типовете в нея (Договор, Споразумение, Приложение, Анекс, Протокол, Разписка, Пълномощно, Декларация, Жалба, Искова молба, Нот. покана, Оферта, Фактура, СМР, КСС).

Поведение: Filter mode (без нова страница).
- Активен чип филтрира `CATALOG` така, че да показва само документи с `documentType === selected`.
- Изключителен избор (един активен тип) + бутон „Всички".
- URL state: `/catalog?vid=<typeId>` за shareable линкове и SEO.
- При активен филтър категориите, които остават с 0 документа, се скриват, а sticky nav-ът се актуализира.

```text
┌─────────────────────────────────────────────────┐
│  ВИД ДОКУМЕНТ                                   │
│                                                 │
│  Договори и споразумения                        │
│  [Договор] [Споразумение]                       │
│                                                 │
│  Приложения, анекси, протоколи                  │
│  [Приложение] [Анекс] [Протокол]                │
│                                                 │
│  Лични документи                                │
│  [Разписка] [Пълномощно] [Декларация]           │
│                                                 │
│  Жалби, искови молби, нотариални покани         │
│  [Жалба] [Искова молба] [Нот. покана]           │
│                                                 │
│  Търговски                                      │
│  [Оферта] [Фактура]                             │
│                                                 │
│  Строителство                                   │
│  [СМР] [КСС]                                    │
└─────────────────────────────────────────────────┘
```

## 2. Тагване на бланките с `documentType`

- Разширяване на `CatalogDocument` (в `src/data/catalog.ts`) с задължително поле `documentType: DocumentTypeId`.
- Скрипт `scripts/backfill-document-types.ts` (еднократен, ръчно изпълнен) задава тип на 282-те съществуващи документа чрез ключови думи в името („Договор" → contract, „Декларация" → declaration, „Протокол" → protocol, „Анекс" → annex, „Приложение" → appendix, „Фактура" → invoice, „Оферта" → offer, „Жалба" → complaint, „Искова молба" → claim, „Пълномощно" → power_of_attorney, „Разписка" → receipt, „Нотариална покана" → notary_invitation, „КСС" → kss, „СМР" → smr, fallback → contract).

## 3. 150 нови професионални бланки (10 × 15 типа)

За всеки от 15-те типа документ — 10 нови, разпределени в най-подходящата категория (или в новосъздадени за лични/правни типове ако липсват). Включват:
- запис в `CATALOG` (name, purpose, keyClause, documentType, badge?)
- автоматично попадат в `/shablon/:slug` (вече работи през `templateIndex.ts`)
- мета запис в `TEMPLATE_CONTENT_META` (introExcerpt за meta description)
- файл в `src/data/templateContent/<slug>.ts` с пълно AI-генерирано съдържание (intro/usageCases/requirements/mistakes/faq) — генериран чрез скрипт `scripts/generate-template-content.ts` (вече съществува, ще му подадем новите slug-ове)
- **готов draft текст**: нов файл `src/data/templateDrafts/<slug>.ts` с пълен примерен текст на бланката (заглавие, преамбюл, страни, клаузи, подписи), готов за директно сваляне.

Примерно разпределение (по 10 на тип):

| Тип | Категория | Примери |
|---|---|---|
| contract | разни | Договор за заем, спонсорство, влог, ремонт, посредничество… |
| agreement | разни | Споразумение за прекратяване, разсрочване, медиация… |
| appendix | trudovi/digital | Приложение „Техническо задание", „Ценоразпис", „SLA"… |
| annex | trudovi/naem | Анекс за заплата, срок, наемна цена, длъжност… |
| protocol | разни | Приемо-предавателен, констативен, инвентаризация… |
| receipt | lichni (нова) | Разписка за получена сума, ключове, документи… |
| power_of_attorney | punomoshtni | Общо, за МПС, за банка, за НАП, нотариално… |
| declaration | decl | По чл. 264 ДОПК, ГДПР, конфликт на интереси… |
| complaint | legal (нова) | До КЗП, КЗЛД, инспекция по труда, омбудсман… |
| claim | legal | Заповедно производство, парично вземане, делба… |
| notary_invitation | legal | За прекратяване, за плащане, за освобождаване… |
| offer | trade | Търговска, за СМР, проформа, рамкова… |
| invoice | schetovodni | Данъчна, проформа, кредитно/дебитно известие… |
| smr | stroitelstvo | Акт 19, акт 12, протокол за СМР… |
| kss | stroitelstvo | КСС за ремонт, ново строителство, инсталации… |

Категориите `lichni` и `legal` ще бъдат добавени в `CATALOG`, ако не съществуват в подходяща форма (текущо има `decl` и `punomoshtni` — ще се преоформят/допълнят, не дублират).

## 4. Template page — рендер на draft текста

В `src/pages/Template.tsx`:
- Lazy-load на `templateDrafts/<slug>.ts` паралелно с `aiContent`.
- Нова секция „Готов образец" над FAQ с предварителния текст в monospace/serif рамка.
- Бутон „Свали PDF / DOCX" с draft-а (използва съществуващия `downloadDocument` flow с `kind: "template"`).

## 5. SEO + Sitemap

- `scripts/build-sitemap.ts`: 150-те нови `/shablon/<slug>` влизат автоматично в `sitemap-templates.xml` (минават през `allTemplates()`). Без промяна на скрипта.
- Нов `/catalog?vid=<type>` — добавя се в `sitemap-static.xml` като 15 нови URL-а с `priority 0.8`.
- `Catalog.tsx` чете `?vid=` и поставя:
  - динамичен `<title>` / `description` (напр. „Договори — каталог на български | Dogovori.net")
  - канонически URL към `/catalog?vid=<type>`
  - JSON-LD `ItemList` ограничен до филтрираните документи
- `TEMPLATE_CONTENT_META` се обогатява с 150-те нови записа (генератор скрипт).
- Преглед на финдингите от SEO scanner (`list_findings`) след промените.

## Технически детайли

**Засегнати файлове:**
- `src/data/catalog.ts` — нов `documentType` field + 150 нови записа + евентуално 2 нови категории
- `src/pages/Catalog.tsx` — нова филтър-секция, URL state, динамично SEO
- `src/pages/Template.tsx` — рендер на draft текст
- `src/data/templateContentTypes.ts` — без промени
- `src/data/templateContent/<slug>.ts` × 150 — AI-генерирани файлове
- `src/data/templateDrafts/<slug>.ts` × 150 — draft текстове (нова папка)
- `src/data/templateContentMeta.ts` — +150 записа
- `src/lib/templateDrafts.ts` — нов loader (като `templateContent/index.ts`)
- `scripts/backfill-document-types.ts` — еднократен tagger
- `scripts/generate-template-drafts.ts` — нов AI генератор за draft текстовете (използва Lovable AI Gateway, модел `google/gemini-2.5-pro`)

**Скриптове за изпълнение:**
1. backfill на `documentType` за 282 съществуващи документа
2. добавяне на 150-те нови записа в CATALOG
3. `generate-template-content.ts` за новите slug-ове (intro/faq/…)
4. `generate-template-drafts.ts` за draft текстовете
5. ръчен преглед на 10-20 случайни draft-а за качество

**Очаквана продължителност на генериране:** ~30-45 мин AI извиквания (150 × 2 файла).

**Не са нужни** database миграции, нови secrets или backend промени — всичко е статично съдържание.
