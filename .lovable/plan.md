
# Оптимизация на AI самообучението (v2)

Текущата система работи добре: адвокат-генератор → DogovaryAI → адвокат-съдия → patcher. Долу са **7 конкретни подобрения**, групирани по приоритет. Може да изберете кои да направим.

## Приоритет 1 — Качество на обратната връзка

### 1. Rubric-based scoring (вместо едно число 1–10)
Вместо `score: 1-10`, съдията връща оценка по **5 измерения**:
- `legal_accuracy` (цитиране на ЗЗД/ТЗ/КТ/ЗУТ)
- `tool_usage` (правилни tools, в правилен ред)
- `canon_compliance` (без индивидуален съвет/чуждо право)
- `clarity` (език, структура)
- `usefulness` (помага ли реално)

Patcher вижда **къде** точно е слаб ботът → таргетирани патчове, не общи.
Нова колонка `scores_breakdown jsonb` в `ai_simulation_turns`. Avg score = mean per dimension.

### 2. Scenario bank (вместо free-form scenario поле)
Таблица `ai_simulation_scenarios`: 20–50 предефинирани сценария от реалния live use (HR увольнение, наем, NDA с чужденец, опит за индивидуален съвет, ЕГН в чата, и т.н.) с очаквано поведение и tags.
Run tab позволява: "random 5 от категория `canon_violations`" или "регресия върху всички failed-преди сценарии".
Така тестваме **повтаряемо** — две сесии с един и същ сценарий са сравними.

## Приоритет 2 — Регресия и сравнение

### 3. A/B автоматизирано (champion vs challenger)
Бутон **"Сравни 2 модела/промпта"**: пуска ОДНОВРЕМЕННО 2 сесии (same scenarios, same lawyer) — текущия prod prompt+model срещу кандидата. Side-by-side table с avg scores по rubric. Едва тогава бутонът "В продукция" се появява, ако challenger печели по ≥3 от 5 измерения.

### 4. Regression guard преди apply на patch
В момента patch се прилага директно. Добавяме: при apply на patch → автоматично пуска **mini-regression** (3–5 сценария от bank) върху новия промпт. Ако avg score падне с >0.5 спрямо предишния — патчът се **откатва** автоматично + toast warning. Защита от "patcher разваля канона".

## Приоритет 3 — По-добър patcher

### 5. Few-shot patcher с примери от applied successful patches
Patcher промптът сега е "blind". Заredим му последните 3 **applied + score-improved** patches като примери (in-context learning). Качество на патчовете расте с историята.
Изисква: read от `ai_simulation_patches WHERE status='applied'` + JOIN със scores преди/след.

### 6. Issue clustering преди patching
В момента patcher вижда всички issues от 5 хода накуп. Вместо това:
- Групираме issues по `section_key` + `severity`
- Patcher работи **по една секция наведнъж** (по-фокусиран промпт, по-малко "smearing")
- Result: 1–2 high-quality patches вместо 5 разпилени

## Приоритет 4 — Cost / скорост

### 7. Two-tier judging
- "Бърз съдия" (gemini-2.5-flash) минава всичките 5–20 хода → евтино screening
- "Senior съдия" (gemini-2.5-pro / gpt-5.4-pro) минава само ходовете с score <7 от бързия → задълбочена обратна връзка
- Намаля cost ~60% за 20-turn сесии, без загуба на качество за слабите ходове.

---

## Бонус (за обсъждане, не в този PR)

- **Adversarial mode**: адвокатът знае текущите слабости от историята и **цели да ги възпроизведе** (instead of random testing).
- **Auto-schedule**: nightly cron пуска 1 сесия с random scenarios → утрешният прег­лед на patches без ръчно стартиране.
- **Human-in-the-loop scoring**: бутон "Не съм съгласен със съдията" → ръчна корекция на score → влиза в few-shot към съдийския промпт (RLHF-light).

---

## Препоръка

Започваме с **#1 (rubric) + #2 (scenario bank) + #4 (regression guard)**. Това дава най-голяма стойност с най-малък риск:
- Rubric → patcher става хирургичен
- Scenario bank → измерваме напредък във времето
- Regression guard → защита от регресии при apply

Останалите (#3, #5, #6, #7) — във следващи итерации.

## Засегнати файлове (за избрания минимум #1+#2+#4)

- Нова migration: `ai_simulation_scenarios` (id, title, category, scenario_text, expected_behavior, tags, active), `ai_simulation_turns.scores_breakdown jsonb`, `ai_simulation_sessions.scenario_id uuid`.
- `supabase/functions/simulation-run/index.ts` — rubric в judge prompt, parse breakdown, optional `scenarioId` body param.
- Нова edge функция `simulation-regression` (или флаг в `apply-prompt-patch`) — пуска 3-сценарийна регресия и връща pass/fail.
- `src/pages/AdminAiSimulation.tsx` — Run tab: dropdown за scenario от bank или random; History tab: визуализация на 5-те измерения (radar/badges); Patches tab: бутон "Apply с регресия".
- Нов админ под-таб **"Сценарии"** за CRUD върху scenario bank.

## Какво НЕ правим

- Не пипаме текущия prod prompt.
- Не сменяме модели по подразбиране.
- Не правим auto-apply на patches — apply остава ръчен с regression guard отгоре.
