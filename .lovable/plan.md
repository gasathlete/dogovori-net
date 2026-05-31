# Why новият потребител вижда празно

Проблемът е на две места:

1. **Wizard preview (десният панел „Работен договор")** — `src/components/wizard/LiveDraft.tsx` → `buildInitialClauses(sector, answers)` има `switch` само за 5 сектора (`real-estate`, `construction`, `logistics`, … `trade`). За всички останали (`family`, `employment`, `corporate`, `power-of-attorney`, `finance`, `healthcare`, `ip`, `services`, `digital`, `vehicles`, `ecommerce`, `energy`, `agriculture`, `sports`, `media`, `partnerships`) `default: return []`. Новият потребител на `/wizard/family` вижда само заглавие, преамбюл с „между:" и един сив бокс отдолу — нула клаузи. Естествено напуска.
2. **Template SEO страница** (`src/pages/Template.tsx`) — за шаблони без файл в `src/data/templateContent/*.ts` (има ~280 такива от 432) се показва кратко generic intro и по 3–4 общи булета за „Кога се използва" / „Грешки" / FAQ. Усещането е „това е празна страница".

# Какво ще променим (само UI/presentation)

## 1. LiveDraft — общ skeleton за всеки сектор

В `src/components/wizard/LiveDraft.tsx`:

- Извличам `baseClosing` (Форсмажор, Подсъдност, Severability, Заключителни) извън `switch`-а — вече се преизползва.
- Добавям **generic builder** `buildGenericClauses(sector, answers, docName)` с 6 универсални клаузи:
  - I. Предмет на договора (използва `sector.contractName` или подаденото `docName` от query параметъра + `answers.subject_summary` / `extra_notes` ако има)
  - II. Срок и действие (`answers.duration` / „безсрочно, до писмено прекратяване")
  - III. Възнаграждение и плащане (с `€`)
  - IV. Права и задължения на страните
  - V. Отговорност и неустойки (с `penalty_pct`, `penalty_cap`)
  - VI. Прекратяване (с `termination`, `notice_days`)
  - + `baseClosing`
- `default:` в `switch` връща `buildGenericClauses(...)` вместо `[]`.
- За избрани специфични сектори, където skeleton-ът би бил подвеждащ, добавям по 1 case с правилните страни / терминология:
  - `employment` — Трудов договор / длъжностна характеристика (работодател/служител, длъжност, работно време, отпуск, възнаграждение)
  - `family` — заглавието и преамбюлът да използват „Заявител" / „Получател" вместо страни от договор, скелет за нотариална покана / декларация (предмет, основание, искане, дата)
  - `power-of-attorney` — Упълномощител / Пълномощник, обем на представителната власт, срок, отмяна
  - `finance` — Заемодател / Заемополучател, главница, лихва, срок, обезпечение, неустойка
  - `healthcare`, `ip`, `services` — generic skeleton е достатъчен
- Подавам `docName` (взет от `searchParams.get("doc")` в `Wizard.tsx`) към `LiveDraft` като нов prop, за да може заглавието и преамбюлът на skeleton-а да съответстват на конкретния избран документ, а не само на общото име на сектора. (Малка промяна в `src/pages/Wizard.tsx` — само подаване на prop, без логика.)
- Долният сив бокс („работен текст") получава по-силно послание:
  > Това е примерен скелет на „<doc name>", който се актуализира на живо с Вашите отговори. Финалният документ — с прецизни клаузи по ЗЗД/ТЗ/КТ, оценка на риска и препоръки — се генерира от ИИ след завършване на въпросника. Отговарянето отнема ~2 минути.

  + малка прогрес-индикация „Попълнени X / Y отговора" за по-силен hook.

## 2. Template SEO страница — по-богат fallback

В `src/pages/Template.tsx`:

- Когато `aiContent` още не е зареден или такъв файл липсва за слъга, fallback-овете `usageCases`, `requirements`, `mistakes`, `faq` се изчисляват от:
  - `doc.name`, `doc.purpose`, `doc.keyClause`
  - `category.title` (трудово, семейно, недвижими имоти, …)
- Разширявам fallback масивите от 3–4 на 5–6 точки всеки, със смислени по-конкретни формулировки (а не текущите 3 generic).
- Добавям нов fallback блок „Какво включва документът" (skeleton от 4 типични раздела: страни, предмет, права и задължения, прекратяване) — показва се само когато няма `draftText`, за да не дублира „Готов образец".
- Над hero CTA добавям лента с trust сигнали (вече ги има за пълни шаблони — само разширявам да се показват винаги): „✓ По ЗЗД/ТЗ/КТ · ✓ PDF & DOCX · ✓ Готов за 2 минути · ✓ Безплатен първи документ".

## 3. Без промяна

- Никаква бекенд логика, edge functions, схема, RLS.
- SEO структурираните данни остават (FAQ JSON-LD ще включва разширените въпроси).
- Шрифтове, цветове, токени — без промяна.

# Файлове

- `src/components/wizard/LiveDraft.tsx` — generic builder + employment/family/power-of-attorney/finance специфики + по-силен помощен текст + опционален `docName` prop.
- `src/pages/Wizard.tsx` — подава `docName={searchParams.get("doc") ?? undefined}` към `<LiveDraft />`. Без друга логика.
- `src/pages/Template.tsx` — по-обемни fallback масиви + нов skeleton блок + винаги-видими trust signals.

# Тестване

- `/wizard/family?doc=Нотариална+покана...` → виждам пълен скелет с 6 клаузи и помощен текст.
- `/wizard/employment` без doc → виждам skeleton за трудов договор.
- `/shablon/<слъг-без-templateContent>` → виждам разширените 5–6 булета и skeleton секция.
- `/shablon/trudov-dogovor-po-chl-67-kt-bezsrochen` → нищо не се чупи (има `aiContent` → fallback не се ползва).
