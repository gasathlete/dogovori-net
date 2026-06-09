# Console View — Работен плот „Архитект на сделките"

Нова CRM-style работна среда в `dogovori.net`, достъпна от профила. Интегрира съществуващите функции (шаблони, wizard, качени договори, анализи, подписване, екипи) в единен мулти-таск интерфейс. Спазва EUR-only и текущия metering модел — отварянето на таб не е операция; платените действия (download/upload+analyze) остават както са.

## 1. Архитектура на изгледа

```text
┌───────────────────────────────────────────────────────────────┐
│ Глобален хедър (съществуващ)                                  │
├──────────┬─────────────────┬─────────────────────────────────┤
│ Лява     │ Среден списък   │ Tab bar (browser-like)          │
│ навигация│ (динамичен)     │ ┌──────┬──────┬──────┬───┐      │
│          │  • филтри       │ │ Tab1 │ Tab2*│ Tab3 │ + │      │
│ • Табло  │  • търсене      │ ├──────┴──────┴──────┴───┴──────┤│
│ • Сделки │  • сортиране    │ │ Активен canvas (split-view)   ││
│ • Клиенти│  • виртуализиран│ │ ┌──────────┬────────────────┐ ││
│ • Шаблони│   списък        │ │ │Метаданни │ Документ /     │ ││
│ • Док-ти │  • bulk select  │ │ │ 30%      │ изглед 70%     │ ││
│ • Анализи│                 │ │ └──────────┴────────────────┘ ││
│ • Екип   │                 │ │ Footer: статус, бр. ops       ││
│ collapse │                 │ │                                ││
└──────────┴─────────────────┴────────────────────────────────┘
```

- **Маршрут**: `/console` (и под-маршрути `/console/:section/:entityId?`). URL-ът отразява активния таб, така че линкове са споделими; табовете обаче живеят паралелно в паметта.
- **Достъп**: за всички логнати потребители. Pro/Team отключва: повече от 3 паралелни таба, споделяне на сделки в екип, експорт на Сделка като пакет, AI обобщение на сделка.
- **Desktop-first**: пълен 3-колонен изглед при ≥1280px. При 1024–1279px лявата колона става icon-only (`shadcn Sidebar collapsible="icon"`). Под 1024px списъкът се рендерира като Sheet drawer, а split-view се сгъва в табове „Метаданни / Документ" вътре в активния canvas.

## 2. Persistent Tab System

- Глобален стор `useConsoleStore` (Zustand — лек, мач към съществуващия стил; алтернатива: context+reducer ако екипът предпочита нулеви depes).
- Tab shape: `{ id, kind, entityId, title, icon, dirty, pinned, scrollY, formDraft, openedAt }`.
- `kind`: `dashboard | deal | document | uploaded | template | client | analysis | wizard | signing`.
- **State retention**: всички отворени табове остават mounted; неактивните се скриват с `hidden` + `aria-hidden`. Никакво unmount при превключване → формите не губят данни.
- Лимит: 3 безплатно / до 12 в Pro/Team. При надвишаване — toast с upgrade CTA (преизползваме `ProUpgradeDialog`).
- **Pin Tab**: закрепен ляво, не се затваря с „Close all", оцелява refresh.
- **Close All / Close Others / Reopen Closed** (history стек последните 10).
- Persist в `localStorage` по `user.id` (TTL 7 дни). При reload — табовете се възстановяват; ако entity-то е изтрито, табът се маркира с warning и се предлага close.
- **Keyboard**: `⌘T` нов таб, `⌘W` затвори, `⌘⇧T` reopen, `⌘1..9` jump, `⌘K` команден палет (преизползваме `CommandPalette`), `⌘B` toggle sidebar, `⌘[` / `⌘]` prev/next таб.

## 3. Split-view вътре в активен таб

- Resizable splitter (`src/components/ui/resizable.tsx` — налично).
- **Ляво 30% (мин 280px) — Метаданни / CRM полета**:
  - Статус (бадж с цвят по фаза), страни (`PartyListEditor`), сума EUR + ДДС, краен срок, тагове, отговорник, бележки, последна активност, свързани документи (с бутон „Отвори в нов таб"), история на подписване.
  - Inline edit с auto-save (debounced 600ms) + индикатор „Запазено преди X сек".
  - Бързи действия: Подпиши (отваря `SigningEnvelope` в нов таб), Сподели за подпис, Анализ на риска, Експорт PDF/DOCX, Архивирай.
- **Дясно 70% — съдържанието** според `kind`:
  - `document` → `ContractPreview` + corrections panel
  - `uploaded` → viewer + `RiskReport`
  - `template` → детайл + CTA „Изготви по този шаблон" (отваря Wizard таб с prefill от текущата сделка)
  - `wizard` → `SplitWizard` (вече съществува, embed-ва се вътре)
  - `client` → CRM профил: контакти, история, всички сделки/документи
  - `analysis` → `RiskMeter` + детайлен doc по точки
  - `dashboard` → KPI карти (активни сделки, очакващи подпис, изтичащи срокове, ops остатък)
  - `signing` → envelope tracking + signers status

## 4. Данни — нов обект „Сделка"

Нова таблица `public.deals` обединява документи + страни + статуси. Съществуващите документи продължават да работят и без сделка (deal_id е nullable).

| Колона | Тип | Описание |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | owner (FK auth.users) |
| team_id | uuid? | за фирмени сделки |
| title | text | „Наем офис, ул. Витоша 12" |
| status | text enum | `draft`, `negotiating`, `signing`, `active`, `closed`, `archived` |
| counterparty | text | име на контрагента |
| counterparty_email | text? | за бърза покана към подписване |
| amount_eur | numeric? | сума |
| due_date | date? | краен срок |
| tags | text[] | свободни тагове |
| notes | text | бележки |
| pinned | bool | за закачени сделки |
| created_at / updated_at | tstz | |

Свързване (миграция добавя nullable `deal_id` колони — нула риск за съществуващи редове):
- `saved_documents.deal_id` → `deals.id`
- `uploaded_contracts.deal_id` → `deals.id`
- `signing_requests.deal_id` → `deals.id`

RLS: owner или член на същия team може да чете/редактира. Грантове за `authenticated` и `service_role`. Триггер `set_updated_at`. Helper функция `user_can_access_deal(_deal_id)` използва съществуващата `is_team_member`.

„Клиент" в първа фаза = виртуален обект, агрегиран от `counterparty` (без отделна таблица). Във фаза 2 може да стане самостоятелна таблица `clients` с history.

## 5. Файлова структура

```
src/pages/Console.tsx                       // shell, рутиране, store provider
src/components/console/
  ConsoleSidebar.tsx                        // лява навигация
  ConsoleListColumn.tsx                     // среден списък, делегира към List по секция
  ConsoleTabBar.tsx                         // browser-like табове + действия
  ConsoleCanvas.tsx                         // mount-all renderer (hidden=!active)
  ConsoleFooter.tsx                         // статус линия (ops, save state, shortcuts hint)
  panes/
    DashboardPane.tsx
    DealPane.tsx                            // split: meta + linked docs board
    DocumentPane.tsx                        // ContractPreview интеграция
    UploadedPane.tsx                        // uploaded viewer + risk
    TemplatePane.tsx
    ClientPane.tsx
    AnalysisPane.tsx
    WizardPane.tsx                          // wraps SplitWizard
    SigningPane.tsx
  meta/
    MetadataPanel.tsx                       // 30% ляв панел (общ)
    DealMetaForm.tsx
    DocumentMetaForm.tsx
  lists/
    DealsList.tsx, DocsList.tsx, ClientsList.tsx,
    TemplatesList.tsx, AnalysesList.tsx, DashboardList.tsx
  shortcuts/useConsoleShortcuts.ts
src/hooks/useConsoleStore.ts                // Zustand store + persist
src/hooks/useDeals.ts                       // CRUD + realtime подписка
```

Линк към Console:
- Header (логнат потребител): primary CTA „Работен плот".
- `Account` страница: голяма карта „Отвори Console View".
- След download/upload се появява toast „Отвори в Console" → отваря в нов таб.

## 6. Микро-интеракции и моушън

- Tab open: subtle slide-in отдясно (Motion, 180ms ease-out).
- Tab close: collapse width → 0 с opacity fade.
- List row hover: gold accent линия отляво (1px).
- Splitter: визуален grip + cursor `col-resize`, snap при 25/30/40/50%.
- Sidebar collapse: width transition 200ms, икони с tooltip.
- Dirty dot: pulsing gold на таба, ако има unsaved формна промяна.
- Empty states: илюстрация + 3 бързи действия („Нова сделка", „Качи договор", „Изготви по шаблон").

## 7. Етапи на изпълнение

1. **Миграция** `deals` + `deal_id` колони + RLS + GRANTs + триггер.
2. **Shell + store**: `/console` route, `useConsoleStore`, persist, празен canvas с placeholder.
3. **Sidebar + Tab bar** (без съдържание) + keyboard shortcuts.
4. **DashboardPane** и **DocumentPane / UploadedPane** (преизползват съществуващите viewer-и) — най-бърза стойност за потребителя.
5. **DealsList + DealPane + MetadataPanel** (inline edit, auto-save).
6. **TemplatePane + WizardPane** (с prefill от текуща сделка).
7. **ClientPane (агрегиран)**, **AnalysisPane**, **SigningPane**.
8. **Polish**: motion, empty states, mobile fallback, тестове за store quota neutrality (отваряне на таб ≠ op), e2e сценарий „отвори 3 сделки, мини през всеки таб, refresh → state intact".

## Технически бележки

- Без нови тежки зависимости — преизползваме `react-resizable-panels`, `cmdk`, `@tanstack/react-virtual`, `framer-motion`, shadcn `Sidebar`.
- Zustand е единствената нова dep (~1KB). Алтернатива: чист context+reducer ако предпочиташ нулеви добавки.
- EUR-only, текущ metering и Pro/Team гейтинг се запазват без промяна.
- A11y: roving tabindex на tab bar, `role="tablist"`, `aria-selected`, focus visible, screen-reader announce при tab switch.
- SEO: `/console` остава `noindex` (private workspace).
