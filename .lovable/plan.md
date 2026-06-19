# План: Симулационна сесия за самообучение на DogovaryAI

Нов админ модул `/admin/ai-simulation` (под `AdminMFAGuard`), който пуска многоходов диалог между **DogovaryAI** (реалния активен промпт + tools) и **AI-Юрист** (отделен модел от Lovable AI Gateway). Юристът задава въпроси като реален потребител, оценява всеки отговор, открива грешки и в края генерира **patch-предложения** за конкретни секции от системния промпт. Админът преглежда и прилага → автоматично се създава нов draft в `ai_prompts` (`is_active=false`), готов за активиране от съществуващия екран `/admin/ai-training`.

## Поток

```text
┌───────────────────────────────────────────────────────────┐
│ ADMIN UI: /admin/ai-simulation                           │
│  [сценарий] [Lawyer модел ▾] [брой ходове 5–20] [Старт]  │
└──────────────────────────┬────────────────────────────────┘
                           │ SSE
                ┌──────────▼─────────┐
                │ edge: simulation-  │
                │   run (is_staff)    │
                └──────┬──────┬───────┘
                       │      │
            DogovaryAI │      │ Lawyer (Generator)
            (реален    │      │ ─ генерира user msg
             промпт +  │      │
             tools)    │      │ Lawyer (Judge)
                       │      │ ─ оценява, namira грешки
                       ▼      ▼
              ai_simulation_turns (per-turn запис)
                       │
                       ▼ (накрая)
            Lawyer (Patcher) → ai_simulation_patches
                       │
                       ▼ (Приложи от админа)
            нов draft в ai_prompts + ai_prompt_sections
                       │
                       ▼
            /admin/ai-training → ревю → Активирай
```

## База данни (нова миграция)

Три нови таблици, всички `is_staff()`-only:

- **`ai_simulation_sessions`** — `created_by`, `function_name` (default `assistant-chat`), `prompt_version_id` (FK към `ai_prompts` — кой промпт е тестван), `scenario` (текст от админа), `lawyer_model`, `max_turns`, `status` (`running`/`completed`/`failed`/`aborted`), `avg_score`, `turn_count`, `created_at`, `completed_at`.
- **`ai_simulation_turns`** — `session_id` FK, `turn_index`, `user_message` (от Lawyer), `dogovary_response`, `dogovary_tools` jsonb (списък от tool_calls), `lawyer_verdict` (markdown), `score 1–10`, `issues` jsonb (`[{section_key, finding, severity}]`), `created_at`.
- **`ai_simulation_patches`** — `session_id` FK, `section_key`, `patch_description`, `patch_content` (предложено ново съдържание), `status` (`pending`/`applied`/`rejected`), `applied_prompt_id` FK към новия draft, `created_at`, `decided_by`, `decided_at`.

GRANT-овете и RLS политиките се добавят в същата миграция по правилата на проекта.

## Нов edge function: `simulation-run`

`supabase/functions/simulation-run/index.ts` — SSE стрийм с прогрес.

**Цикъл за `N` ходове (N = 5..20):**
1. **Lawyer-Generator** генерира следващото потребителско съобщение (включително edge cases: непълни данни, чужда юрисдикция, спорни клаузи, провокации, опити да накара DogovaryAI да даде индивидуален съвет).
2. **DogovaryAI** отговаря — извикваме същия Lovable AI Gateway модел като реалния асистент, със същия активен промпт (през `loadActivePromptMeta`), същата tools схема (`toolSchemasFor(FULL_TOOL_NAMES)`) и същия server-tool loop за `search_templates`. Client tools (`navigate`, `ask_clarification`, …) се записват като сигнал — НЕ се изпълняват.
3. **Lawyer-Judge** оценява отговора: коректност на правни цитати, правилно ползване на tools, халюцинации, липсваща изясняваща стъпка, нарушения на канона. Връща JSON: `{ score, issues[], verdict_markdown }`.
4. Записва ред в `ai_simulation_turns` и пуска SSE `turn` събитие към админ UI-то.

**Финална фаза:**
5. **Lawyer-Patcher** получава всички turns + текущите секции на активния промпт и връща структурирани patch-ове по `section_key`. Записва се в `ai_simulation_patches` като `pending`. Сесията се маркира `completed` с осреднен score.

Всяко повикване към gateway-а минава през `logAiAudit()` (като всички останали AI операции в проекта).

## UI: `/admin/ai-simulation` (нов `AdminAiSimulation.tsx`)

Три таба, добавени към навигацията в `Admin.tsx` (бутон „🥋 AI симулация"):

1. **Нова симулация** — форма (сценарий, Lawyer модел от съществуващия `AVAILABLE_MODELS`, max turns, чек-бокс „включи tools"). Старт → SSE стрийм с live карти за всеки ход: user-съобщение, DogovaryAI отговор (markdown + tool_calls badge), Lawyer-присъда, score badge.
2. **История** — таблица със сесии (status, средно score, брой ходове, дата, моделът на Lawyer). Click → разгръща всички turns.
3. **Patch-ове** — групирани по сесия. За всеки patch: section_key, описание, side-by-side diff (текущо vs. предложено). Бутони **Приложи** / **Отхвърли**.

**Apply Patch** използва точно същата логика като `saveNewVersion()` от `AdminAITraining.tsx`: клонира секциите на активния промпт, подменя само match-натите `section_key` с `patch_content`, вмъква нов ред в `ai_prompts` с `is_active=false` и `notes="Авто-patch от симулация #<id>"`, плюс свързаните `ai_prompt_sections`. Линкът към новия draft се запазва в `ai_simulation_patches.applied_prompt_id` и в нотификация „Активирай в AI обучение".

## Архитектурни детайли (техническо)

- **Авторизация**: edge function проверява Bearer JWT → `is_staff` RPC. Без staff → 403.
- **Симулацията НЕ пише в `assistant_threads`/`assistant_messages`** — изолирана е, за да не замърсява потребителските чатове или метриките.
- **Tools fidelity**: client-side tools се извличат от `tool_calls` отговора, записват се в `dogovary_tools` (име + args) и Lawyer-Judge получава експлицитна инструкция, че тяхното присъствие/отсъствие е сигнал за оценка (напр. „трябваше да извикаш `ask_clarification`").
- **Стрийминг**: вътрешните повиквания към gateway-а са `stream: false` (по-просто). Към админ браузъра стриймваме само meta събития (turn-completed).
- **Cost guard**: всеки turn = ~3 gateway повиквания. Лимитираме max_turns=20 и логваме разхода през съществуващия `logAiAudit`. Показваме броя ходове + модел в историята, за да е видим разходът.
- **Reuse, не дублиране**: `_shared/prompt-loader.ts`, `_shared/assistant-tools.ts`, `_shared/ai-call.ts`, `_shared/cors.ts` се преизползват — нула дублиран код. Реалният `assistant-chat` остава непроменен.

## Файлове за създаване/промяна

- ➕ нова миграция (3 таблици + GRANT/RLS)
- ➕ `supabase/functions/simulation-run/index.ts`
- ➕ `src/pages/AdminAiSimulation.tsx`
- ✏️ `src/App.tsx` — добавя route `/admin/ai-simulation`
- ✏️ `src/pages/Admin.tsx` — добавя бутон в навигацията

## Какво НЕ влиза в този план

- Промени по реалния `assistant-chat` (остава непокътнат)
- Промени по `ai_prompts` схемата (използваме съществуващото поле `is_active`)
- Авто-активиране на patch-ове без админ одобрение (умишлено — две AI-та не бива да сменят production промпта)
- Run-on-schedule (cron). Сесиите се стартират ръчно от админа в този MVP. Може да се добави в следваща стъпка.
