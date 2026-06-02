# План: Комплекти документи (Document Kits)

Целта е да въведем понятието „комплект" — група свързани документи, които обикновено вървят заедно (основен договор + приложения + придружаващи). Всичко е **добавъчно** — не пипаме съществуващите wizard, catalog, document_links, appendix merger и Account логики.

---

## 1. Какво е „комплект"

Два типа:

- **Предефинирани комплекти** (статични, ~22 бр.) — куратиран списък от шаблони от `CATALOG`, групирани за конкретен бизнес сценарий (напр. „Регистрация на ООД — пълен пакет").
- **Потребителски комплекти** — потребителят сам прави комплект от своите запазени/качени документи (или стартира предефиниран и системата му пази прогреса).

---

## 2. Предефинирани комплекти

Нов файл `src/data/documentKits.ts`:

```ts
export interface KitItem {
  docName: string;       // съответства точно на CATALOG document.name
  role: "primary" | "appendix" | "companion";
  optional?: boolean;
}
export interface DocumentKit {
  id: string;            // slug
  title: string;
  sectorId: string;
  icon: string;          // lucide
  shortDescription: string;
  forWho: string;
  items: KitItem[];
  featured?: boolean;
}
```

### Списък (общо ~22, групирани):

**Фирмено / корпоративно право (силно разширено — 8 комплекта):**
1. **Регистрация на ООД** — учредителен акт/дружествен договор, решение на едноличния собственик / протокол от учредително събрание, декларации по чл. 13 ал. 4 ЗТР, декларация за истинност, съгласие и спесимен на управителя, документ за внесен капитал, заявление А4.
2. **Регистрация на ЕООД** — учредителен акт, решение, декларации, спесимен, нотариално заверено съгласие.
3. **Регистрация на АД** — устав, протокол от учредително събрание, списък на акционери, решения за избор на СД/НС, декларации, банков документ за капитала.
4. **Промяна по партида на дружество (управител/седалище/предмет)** — протокол от ОС, нов учредителен акт (актуализиран), декларации, заявление А4.
5. **Прехвърляне на дружествени дялове** — договор с нотариална заверка, протокол от ОС, актуализиран дружествен договор, декларации по чл. 129 ТЗ, заявление.
6. **Увеличаване / намаляване на капитал** — протокол ОС, изменен учредителен акт, банкова бележка, декларации.
7. **Ликвидация на дружество** — решение за прекратяване, назначаване на ликвидатор, обявление в ТР, ликвидационен баланс, заличаване.
8. **Акционерно споразумение** — основно споразумение + NDA + правила за разпределение на печалби.

**Имоти / Наем:**
9. Наем на жилище — пълен пакет
10. Наем на офис / търговски обект
11. Краткосрочен наем (Airbnb тип)
12. Покупко-продажба на недвижим имот

**Труд и услуги:**
13. Трудово назначаване (чл. 67 КТ)
14. Граждански договор / freelancer

**Дигитално / IP:**
15. Дигитален проект (изработка + NDA + ППП)
16. SaaS клиент пакет
17. NDA + IP трансфер
18. GDPR пакет за малък бизнес

**Други ключови:**
19. Строителен обект (СМР пакет)
20. Продажба на МПС
21. Фактуриране за услуги (EU/extra-EU)
22. Наследствено дело — основни документи

Всеки `docName` се валидира в `scripts/verify-build.ts` срещу `CATALOG` — build гърми при липсващ шаблон. За кратко липсващите фирмени документи в `CATALOG` се добавят като нови `CatalogDocument` записи (без да се пипат съществуващите).

---

## 3. Потребителски комплекти — БД

Нова схема, **не пипа** `document_links`, `saved_documents`, `uploaded_contracts`:

```sql
create table public.document_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid,
  title text not null,
  source_kit_id text,         -- ако е стартиран от предефиниран
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.document_kits(id) on delete cascade,
  role text not null,         -- primary|appendix|companion
  ref_label text not null,
  saved_id uuid,
  uploaded_id uuid,
  planned_doc_name text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
```

С GRANTs за `authenticated` + `service_role`, RLS по `user_id`/`team_id` (същият pattern като `document_links`).

---

## 4. UI промени (само добавки)

### 4.1 `/komplekti` — листинг
Грид с всички комплекти, табове по сектор (Фирмено, Имоти, Труд, IP, …). Същия surface/gold стил като `SectorGrid`.

### 4.2 `/komplekti/:slug` — детайл
- Списък на документите (primary / приложения / придружаващи), всеки с линк към `/shablon/:slug`.
- Бутон „Стартирай комплект" → създава `document_kits` запис, води през wizard на първия документ, след save → следващ.

### 4.3 Интеграция в съществуващ flow
- **`ReferencePromptDialog`**: трети бутон „**+ Добави в комплект**" — popover „Нов комплект" / избор от активни. След избор записва в `document_kit_items` **в допълнение** на сегашния `linkChildToParent`.
- **`DetectedReferencesBanner`**: „Запази тези документи като комплект".
- **Account → нов таб „Комплекти"**: списък, прогрес (X от Y), бутон „Продължи".

### 4.4 Export
- `mergeParentWithAppendices` остава непроменен. Нов helper `exportKitAsPdf(kitId)` минава **през съществуващия** merger.

---

## 5. SEO
- `/komplekti` и `/komplekti/:slug` в нов `sitemap-kits.xml`.
- Schema.org `ItemList` на детайл страницата.
- Линкове от категория страниците („Този комплект включва…").

---

## 6. Какво НЕ променяме
- `document_links`, `appendixMerger`, `ReferencePromptDialog` логиката за upload/generate, wizard, `saved_documents`, `uploaded_contracts`, Stripe/quota.
- Съществуващите `companions: string[]` в `CATALOG`.

---

## Технически детайли

**Нови файлове:**
- `src/data/documentKits.ts`
- `src/pages/Kits.tsx`, `src/pages/KitDetail.tsx`
- `src/components/AddToKitDialog.tsx`
- `src/lib/kits.ts` (`createKit`, `addItemToKit`, `listMyKits`, `kitProgress`)
- миграция за `document_kits` + `document_kit_items` + GRANTs + RLS
- разширение на `CATALOG` с липсващи фирмено-правни документи

**Променени (минимално):**
- `src/App.tsx` — рутове
- `src/components/Header.tsx` — линк „Комплекти"
- `src/pages/Catalog.tsx` — секция „Готови комплекти"
- `src/components/ReferencePromptDialog.tsx`, `DetectedReferencesBanner.tsx`
- `src/pages/Account.tsx` — таб „Комплекти"
- `scripts/build-sitemap.ts`, `scripts/verify-build.ts`

**Грешки:** kit-добавянето е try/catch, non-blocking — единичното запазване продължава.

---

Окей ли е така — да започвам имплементацията?
