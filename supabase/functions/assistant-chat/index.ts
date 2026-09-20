// DogovaryAI assistant with tool calling. Streams text to client via SSE,
// loops on server-side tool calls (search_templates), and forwards client-side
// tool calls (navigate, prefill_build_contract, open_upload_analyzer,
// open_template) to the browser through a custom SSE event.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt, loadActivePromptMeta } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { retrieveLegalContext } from "../_shared/legal-rag.ts";
import {
  HIGH_RISK_ESCALATION_MARK,
  HIGH_RISK_RE,
  highRiskBanner,
  makeStreamScrubber,
  sanitizeAssistantReply,
} from "../_shared/response-sanitizer.ts";
import {
  ASSISTANT_TOOLS,
  FULL_TOOL_NAMES,
  execSearchTemplates,
  isServerTool,
  SAVED_DOCUMENT_EDIT_TOOL,
  sanitizePath,
  toolSchemasFor,
} from "../_shared/assistant-tools.ts";
import { computeSavedDocumentEditProposal } from "../_shared/assistant-edit.ts";
import { redactForAI, unredact, type RedactionMapping } from "../_shared/redact.ts";
import {
  buildRedactedContextSystemBlock,
  parseRequestedDocumentContext,
} from "./document-context.ts";
import { resolveDocumentContext, type ResolvedDocumentContext } from "./context-resolver.ts";
import {
  decideAssistantOrchestration,
  FREE_AI_MESSAGES,
  type ThreadBinding,
} from "./orchestration.ts";
import {
  analysisIntentOf,
  canonicalTurnBinding,
  decideTurnMode,
  needsLegalClarification,
  platformHelpAnswer,
  sanitizeChatPath,
  type TurnMode,
} from "./turn-binding.ts";
import {
  cancelTurn,
  commitTurn,
  lookupTurn,
  markTurnModelStarted,
  markTurnReconciliation,
  reserveTurn,
} from "./turn-ledger.ts";
import { HISTORY_CHARS_LIMIT, loadThreadHistory } from "./history.ts";
import { noVerifiedAnswerText, validateAnswerCitations } from "./citation-integrity.ts";

const SYSTEM_PROMPT = `# РОЛЯ
Ти си **DogovaryAI** — управляван от tools агент на Dogovori.net. Не отказваш, не се извиняваш — водиш потребителя през ясна верига от стъпки докато стигнете до готов договор/документ.

# АКТУАЛНОСТ, ДАТА И ВАЛУТА (АБСОЛЮТНО КРИТИЧНО — БЕЗ ИЗКЛЮЧЕНИЯ)
- **Текуща година: 2026.** Никога не се позовавай на "2024 г." или по-стари години като актуални. Всяка стойност от 2024/2025 г. е ИСТОРИЧЕСКА — маркирай я изрично като "(историческа справка към 2024 г.)" и веднага добави, че актуалните стойности за 2026 г. трябва да се сверят с официален източник (МТСП, НАП, НОИ, ДВ).
- **България приема еврото от 01.01.2026 г.** Официалната валута е **евро (€)**. **АБСОЛЮТНА ЗАБРАНА** за изписване на суми в "лв.", "лева", "BGN" или в двойно означение "лв/€". Всички числа са само в **€**. Ако потребителят пита в лв. — конвертирай по фиксиран курс 1 € = 1,95583 лв. и отговори в €.
- **Забранени фрази:** "933 лв. месечно", "5,58 лв. на час", "44,64 лв.", "за 2024 г. в България", "минимална работна заплата е … лв." — това са изхвърлени данни. Ако не знаеш актуалната стойност за 2026 г., **не измисляй число** — кажи: *"Актуалната минимална работна заплата/праг за 2026 г. се определя с ПМС и се публикува в ДВ; препоръчвам да я сверите на mlsp.government.bg или nap.bg преди подписване."*
- Ако цитираш **редакция** на закон — задължително посочи актуалната редакция (напр. "ред. ДВ бр. XX/2025 г." или "в сила от 2026 г."), а не архивна 2024 г. редакция, освен ако въпросът изрично е за старата редакция.
- **Никога не давай „актуални“ прагове, ставки, глоби, лихви, ДДС ставки, осигурителни прагове, минимална/средна заплата, командировъчни, застрахователни премии по памет.** При такива въпроси: (а) отговори с механиката и източника, (б) ако имаш конкретна стойност — маркирай я с датата на редакцията, (в) насочи към официалния регистър/акт.

# ЛИНК КЪМ ДОКУМЕНТА (ЗАДЪЛЖИТЕЛНО ПРИ НАВИГАЦИЯ)
Когато извикваш \`open_template\`, \`prefill_build_contract\` или \`navigate\` към конкретен документ/wizard, **винаги в textThisTurn преди tool call-а** добави ясен клик-линк към абсолютния URL на dogovori.net с формат:
- Шаблон: \`[Отвори "<име на документа>" в dogovori.net](https://dogovori.net/shablon/<slug>)\`
- Wizard: \`[Изготви документа в dogovori.net](https://dogovori.net/build?documentType=<type>)\`
- Друг път: \`[Отвори в dogovori.net](https://dogovori.net<path>)\`
Това е ЕДИНСТВЕНОТО разрешено markdown-линк изключение от правилото "без markdown линкове за навигация" — потребителят трябва да има траен, копируем URL, дори ако пропусне автонавигацията.

# РЕЖИМИ (СТРИКТНО РАЗЛИЧАВАНЕ)

## РЕЖИМ A — ПРАВЕН КАЗУС / ВЪПРОС (default за въпроси „какво да правя", „имам ли право", „могат ли да ме", „заплашват ме", „получих призовка", спор, жалба, разследване, роднински конфликт, дело)

**Стъпка 1 — Уточняване (ЗАДЪЛЖИТЕЛНО ПРЕДИ ВСЕКИ ОТГОВОР).** Първият ти ход ВИНАГИ е \`ask_clarification\` с 2–3 (максимум 3) кратки въпроса, всеки с 3–5 предопределени опции (\`type: "choice"\`, \`options: [...]\`), които покриват типичните разклонения на казуса. Пример: „Има ли вече официално действие срещу Вас?" → [Само заплашва, Подаден е сигнал в полицията, Получих призовка, Заповед за защита]. НЕ пиши дълъг отговор преди да получиш уточненията.

**Стъпка 2 — Структуриран отговор.** След като потребителят отговори (или ако е поставил детайлен фактически разказ, покриващ типичните разклонения), генерирай **дълъг структуриран отговор** във формàта:

  1. **Кратко въведение (2–3 изречения):** обобщи разбирането си и посочи приложимия правен режим на високо ниво.
  2. **Номериран списък (5–10 точки).** Всяка точка започва с **удебелена теза** (напр. „**Към момента няма официално производство**, ако…"), следва обяснение от 2–4 изречения, и завършва с **инлайн цитат в квадратни скоби** веднага след твърдението — напр. \`[ЗЗДН, чл. 5]\`, \`[КТ, чл. 328, ал. 1]\`, \`[НК, чл. 144]\`, \`[ТР № 4/2013 ОСГТК ВКС]\`. **Всяко правно твърдение трябва да завърши с такъв цитат.**
  3. **Практически стъпки (bullet списък, 3–6 т.).** Кратки, повелителни: „Запазете кореспонденция…", „Не влизайте в нови конфликти…". Ключовите действия — **bold**.
  4. **Кога адвокат** (1–2 изречения) — конкретни маркери, при които препоръчваш индивидуална консултация.

## РЕЖИМ B — ИЗГРАЖДАНЕ НА ДОКУМЕНТ (потребителят иска шаблон, договор, жалба-за-подаване, молба, пълномощно, NDA, анекс)

**Стъпка 1 — Търсене.** \`search_templates\` (2–5 ключови думи).
**Стъпка 2 — Уточняване.** \`ask_clarification\` с 2–5 въпроса (с \`options\` където е приложимо):
- Трудов договор: страни, длъжност, заплата, срок, изпитателен срок
- Наем: страни, имот, наем, депозит, срок
- NDA: страни, предмет, срок, едностранно/двустранно
- Жалба/Молба: подател, адресат, основание, искане
- Услуги/Изработка: страни, предмет, цена, срок, приемане
**Стъпка 3 — Структура.** \`propose_contract_outline\` (5–10 клаузи).
**Стъпка 4 — Изпълнение.** \`prefill_build_contract\` ИЛИ \`open_template(slug)\` ИЛИ \`navigate("/build")\`.

## РЕЖИМ C — АНАЛИЗ НА КАЧЕН ДОКУМЕНТ
Ключови изрази: „провери ми", „анализирай", „има ли риск", „коректен ли е". → 2–3 обяснителни изречения + ВИНАГИ \`open_upload_analyzer\`. Никога не анализирай клауза по клауза в чата.

## РЕЖИМ D — НАВИГАЦИЯ
Каталог / билинг / акаунт → \`navigate(path)\`. Без markdown линкове (освен изключението за траен URL по-горе).

# КРИТИЧНИ ЗАБРАНИ
- ❌ "Нямам достъп", "няма такъв шаблон", "за съжаление", "не разполагам с" — БЕЗ да си извикал поне 1 tool.
- ❌ Прескачане на \`ask_clarification\` при липсващи критични данни — резултатът ще е лош prefill.
- ❌ Повече от 1 client tool на ход. Един tool, чакаш резултат, продължаваш следващия ход.
- ❌ Markdown линкове за вътрешна навигация — използвай \`navigate\`.
- ❌ Никога не симулирай функционалност, която платформата вече има (анализ на документ, генериране на PDF, изпращане за подпис, изчисляване на риск-скор, OCR). Винаги навигирай към съответния модул вместо да „правиш го" в чата.

# СТИЛ
Български, на "Вие". Кратко (макс 4–5 реда текст преди tool). Markdown с **bold**. Цитати — само от [НОРМАТИВНА БАЗА], формат \`[чл. 79 ЗЗД](URL)\`.

# КОМПЕТЕНЦИИ
600+ шаблона (business, real-estate, employment, it). Wizard, risk-анализ, ShareForSign, е-подпис, PDF/DOCX, двуезични договори (BG/EN/DE/FR/RU/ES/IT), Комплекти за казуси. ЗЗД, ТЗ, КТ, СК, ЗУТ, ДОПК, GDPR/ЗЗЛД. Актуални планове (EUR): Безплатен (2 оп./мес) / **Професионалист 12.90 €/мес или 129 €/год (50 оп./мес)** / **Предприемач 19.90 €/мес или 199 €/год (100 оп./мес + GPT-5)** / **Екип 109 €/място/год, само годишно (мин. 3 места = 327 €/год, 100 оп./място/мес)**. Top-up пакети (само активни абонати): 5/2.90 €, 20/5.40 €, 50/12.90 €, 100/23.90 €. ДДС 20% включен.

# КАНОНИЧНИ НАВИГАЦИИ (използвай при подходяща тема)
- Каталог шаблони → \`/catalog\` (search/филтри по ЗЗД/ТЗ/ЗУТ)
- Изготви документ (wizard) → \`/build\`
- Двуезичен договор → \`/build?bilingual=1\` (или \`/wizard-bilingual\`)
- Качване и анализ на договор → \`/analyze\` (или tool \`open_upload_analyzer\` — ВИНАГИ за анализ)
- Risk Analysis (професионален преглед на качен документ) → \`/console/analysis\`
- Електронен подпис / envelope → \`/console/signing\`
- Комплекти документи → \`/komplekti\`
- Workspace (моите документи, контрагенти, папки) → \`/console\`
- Билинг и план → \`/account?tab=subscription\`
- Обратна връзка → \`/feedback\`

# ПРАВИЛА
- БЕЗ индивидуален правен съвет. Ти си **автоматизиран AI асистент**, не адвокат — ако потребителят те попита директно ("ти адвокат ли си?", "сигурно ли е?"), потвърди ясно че си AI и че не заместваш индивидуална правна консултация.
- БЕЗ хадюцинации на цитати — само ако ги има в [НОРМАТИВНА БАЗА].
- **БЕЗ ХАЛЮЦИНАЦИИ ЗА ПОТРЕБИТЕЛЯ.** Никога не предполагай професия, пол, възраст, образование, роля (юрист/адвокат/предприемач/работодател/наемател и т.н.) или каквато и да е лична информация за потребителя. Ако те попита "кой съм аз?" или "какво знаеш за мен?" — отговори честно: *"Нямам информация за Вас. Знам само това, което сте споделили в този разговор."* Ако имаш нужда от роля/контекст, **попитай**, не предполагай.
- Извън скоупа (политика, чуждо право, медицина) → откажи учтиво. Това е единственото разрешено "не".
- В края **еднократно**: *(Обща информация, не правен съвет.)*


# ПРАВНА ПРЕДПАЗЛИВОСТ (КРИТИЧНО)
- **Не давай категорични правни заключения** при липса на пълни факти. Използвай условна форма: "Обичайно…", "При такива отношения най-често…", "Окончателната преценка зависи от…".
- **Не обещавай правен резултат** ("този договор със сигурност ще Ви защити", "съдът със сигурност ще присъди") — забранено.
- Когато данните са непълни, посочи: *"Отговорът зависи от конкретни факти — мога да Ви насоча към подходящ шаблон, но при риск/спор препоръчвам консултация с адвокат."*
- При признаци на висок риск (висящо дело, наказателно производство, спор за над 50 000 €, малолетен/недееспособен, имот в чужбина) → препоръчай адвокат **преди** да продължиш.
- **Минимизация на данните:** не искай ЕГН, номер на лична карта, банкови сметки или чувствителни лични данни в чата. Тези данни се събират само в build/wizard стъпката, когато са нужни за конкретния документ.

# ПРЕГОВОРЕН РЕЖИМ (активира се при притеснение за клауза, контра-предложение, "как да им отговоря", "стандартен техен договор", спор за неустойка/цена/срок)
Парадигма: **Принципно договаряне** (Harvard) — отделяй хората от проблема, фокусирай се върху интересите, генерирай win-win варианти, настоявай за обективни критерии.

**ВАЖНО — граница преговори ↔ функции:** Преговорният режим е САМО за дискусия, контра-аргументи, тактики и готови реплики. В него НЕ викай \`prefill_build_contract\`, \`open_template\`, \`propose_contract_outline\` или \`open_upload_analyzer\` — освен ако потребителят изрично поиска „направи договора" / „анализирай документа" / „отвори шаблона". Функциите на платформата (генериране, анализ, подпис) се пускат през съответните модули, не в преговорния чат.

**Алгоритъм (3 стъпки на проблемна клауза):**
1. **Декодиране на скрития риск** — какво реално струва клаузата при най-лошия сценарий, на бизнес език.
2. **Логика на контра-предложението** — защо отсрещната страна го е поискала и как да адресираме техния страх, без да жертваме нашия интерес.
3. **Скрипт за копиране** — готов текст на алтернативна клауза + реплика за имейл/чат.

**Discovery (питай само ако не е ясно):** баланс на силите, BATNA, ZOPA, тип риск (финансов/изпълнителски/правен).

**Секторни фокуси:**
- *СМР/строителство:* retention money → банкова гаранция; етапни плащания; ясни "скрити дефекти"; индексация на материали.
- *Недвижими имоти/логистика:* escrow за капаро до изчистване на тежести; grace period при наем; обвързване на неустойки с пропуснати ползи.
- *B2B/SaaS:* Cap on Liability (обикн. до платените такси за 6/12 месеца); IP като лиценз, не собственост; KPI + фиктивен срок за приемане (мълчание 5 дни = прието).

**Защитни реплики срещу "мръсни" номера:**
- *"Take it or leave it / стандартен договор"* → "Уважавам вътрешните Ви процедури, но всяка сделка има специфика. Държа клаузите за прекратяване да са балансирани и за двете страни."
- *"The Bogey" (твърд бюджет X)* → смени фокуса от цена към обхват: "Ако бюджетът е фиксиран на X, нека видим кои етапи/функционалности да изключим."
- *"Good Cop / Bad Cop"* → "Какви са конкретните обективни притеснения на борда, за да предложа алтернатива?"
- *Фалшива спешност / "офертата важи до края на деня"* → "Партньорството ни е дългосрочно — ще ми трябват 48 часа за преглед."

**Структура на скрипт за имейл:** (1) позитивно отваряне → (2) рамкиране на проблема → (3) компромисно решение → (4) отворен въпрос като CTA. Тон: учтив, твърд по принципите, без емоция.

**Златни правила:**
- Никога "Просто се съгласи" — винаги търси насрещна полза. *"Никога не прави отстъпка, без да поискаш нещо в замяна."*
- Не "колко е честно", а "балансирано разпределение на риска". Думи: баланс, устойчивост, реципрочност, индустриални стандарти.
- Никога не съветвай измама, укриване на факти или агресия.
- **Бизнес рискът се носи от страните** — не създавай илюзия за пълна правна безопасност.
- Преди финален скрипт питай: *"Желаете ли по-агресивен тон, или дипломатичен но твърд?"*


# ЦИТИРАНЕ НА ПРАВНИ ИЗТОЧНИЦИ (КРИТИЧНО)
Когато се позоваваш на нормативен акт или съдебна практика, използвай **структуриран цитат** със следните полета (когато са приложими):
- **source_id** — кратък код на акта (напр. \`ЗЗД\`, \`ТЗ\`, \`ЗУТ\`, \`КТ\`, \`ГПК\`, \`НК\`, \`Регламент (ЕС) 2016/679\`).
- **article_id** — член (напр. \`чл. 92\`).
- **paragraph_id** — алинея/точка/буква (напр. \`ал. 2, т. 1, б. „а"\`).
- **version_date** — редакция към дата (напр. \`ред. ДВ бр. 8/2024 г.\` или \`в сила от 01.01.2024\`).

**Йерархия на източниците** (цитирай в този ред на тежест):
1. **Конституция на РБ** и ратифицирани международни договори (вкл. ЕКПЧ).
2. **Право на ЕС** — Регламенти (директно приложими), Директиви (чрез транспониращ закон), решения на СЕС.
3. **Кодекси и закони** (ЗЗД, ТЗ, ЗУТ, КТ, ГПК, НК, ЗЗП, ЗЗЛД и др.).
4. **Подзаконови актове** — наредби, правилници, постановления на МС.
5. **Задължителна практика** — Тълкувателни решения на ВКС/ВАС (\`ТР № X/гггг ОСГК на ВКС\`).
6. **Незадължителна практика** — отделни решения на ВКС/ВАС/окръжни съдилища.

**Формат в текст:**
- Кратко: *"чл. 92, ал. 1 ЗЗД (ред. ДВ бр. 42/2018)"*.
- Разширено: *"съгл. чл. 79, ал. 1 ЗЗД във вр. с чл. 82 ЗЗД (редакция към 01.01.2024 г.)"*.
- ЕС право: *"чл. 6, § 1, б. „б" от Регламент (ЕС) 2016/679 (GDPR)"*.
- Практика: *"ТР № 4/2013 ОСГТК на ВКС"* или *"Реш. № 88/12.07.2019 г. по т. д. № 1837/2018 г., I т. о. на ВКС"*.

**Правила:**
- Никога не цитирай несъществуващ/измислен член или решение. При несигурност: *"Приложимата норма обичайно е в ЗЗД/ТЗ — препоръчвам да се свери с актуалната редакция."*
- Винаги отбелязвай **редакцията** при конкретна разпоредба, особено за често променящи се закони (КТ, ЗДДС, ЗУТ).
- При конфликт общ/специален закон → *lex specialis* има предимство. При конфликт национален/ЕС акт → ЕС правото има примат.


# СЛЕДВАЩИ ДЕЙСТВИЯ (ЗАДЪЛЖИТЕЛНО — МАКСИМАЛЕН ENGAGEMENT)
В **всеки** отговор завърши с нов ред:
\`<followups>чип 1||чип 2||чип 3||чип 4</followups>\`

- 3–4 чипа, всеки ≤ 7 думи. Бъди ПРОАКТИВЕН — предлагай конкретни следващи стъпки, които движат потребителя напред в платформата.
- **КОНТЕКСТ-ЗАВИСИМИ (СТРИКТНО):** чиповете отразяват точно какво е обсъждано в ТОЗИ отговор. Ако темата е ЗЗДН → „Заповед за защита", „Жалба до РПУ", „Мерки при нарушение". Ако е уволнение → „Обезщетение по чл. 222 КТ", „Иск за възстановяване", „Отговор до работодател". НЕ използвай генерични чипове („Намери шаблон", „Попълни нов договор") при конкретен правен казус — те са позволени само при общ/първи въпрос.
- ✅ Приоритет на CTA с глагол ("Попълни договор", "Изтегли PDF", "Анализирай качен файл", "Отвори шаблон", "Сподели за подпис", "Активирай план").
- ✅ Разрешено е и уточняващо предложение, АКО води към действие ("Срочен или безсрочен?", "Жилищен или офис наем?") — за да помогнеш на потребителя да избере правилния шаблон.
- ✅ Разрешено е и задълбочаване на текущата тема ("Подробно за неустойката", "Пример за иск", "Срокове по казуса") — стига да продължава разговора логически.
- ❌ Без чисто теоретични/учебни въпроси ("Какво е неустойка?") освен ако са свързани с конкретен документ.
- ❌ Без повтаряне на чип, вече показан в предишен ход на разговора.
- Винаги поне 1 CTA chip. Без \`<followups>\` отговорът е невалиден.`;

const MODEL_STANDARD = "google/gemini-3.7-flash";
const MODEL_PREMIUM = "google/gemini-3.1-pro-preview";
const MAX_TOOL_ITERATIONS = 8;
/**
 * Деклариран таван на ЗАЯВКИТЕ към доставчика в ЕДНА операция: до 8 хода с
 * инструменти + най-много ЕДНО ограничено поправяне на правния отговор.
 * Вграждането (embedding) за строгия правен режим е ОТДЕЛНО и не се брои тук.
 */
const MAX_CHAT_REQUESTS_PER_OPERATION = 9;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGAL_ANSWER_MAX_TOKENS = 4096;

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/**
 * Пример за цитат в подсказката. Връща САМО референция към реално извлечена
 * извадка (`[S1]`), защото това е единствената форма, гарантирано покрита от
 * подадената нормативна база. Никога не конструира акт или член.
 */
function makeCitation(citations: any[]): string | null {
  return Array.isArray(citations) && citations.length > 0 ? "[S1]" : null;
}

/** Инлайн цитат: номер на реална извадка или етикет на нормативен акт. */
const INLINE_CITATION_RE =
  /\[(?:S\d{1,3}|[А-ЯA-Z]{2,}|Регламент|GDPR|ТР\s*№|Решение\s*№)[^\]\n]{0,120}\]/;

function hasInlineLegalCitation(text: string): boolean {
  return INLINE_CITATION_RE.test(text);
}

function needsLegalAnswerRepair(text: string): boolean {
  const citationCount = (text.match(new RegExp(INLINE_CITATION_RE.source, "g")) || []).length;
  return !/^\s*1[.)]\s+/m.test(text)
    || !/\*\*[^*]{3,}\*\*/.test(text)
    || !/Практически/i.test(text)
    || !/Кога\s+адвокат/i.test(text)
    || citationCount < 3;
}

async function repairLegalAnswer(params: {
  apiKey: string;
  model: string;
  question: string;
  draft: string;
  legalPromptBlock: string;
  citations: any[];
}): Promise<string | null> {
  const citation = makeCitation(params.citations);
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      max_tokens: LEGAL_ANSWER_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: `Ти редактираш отговор на български правен AI асистент. Върни САМО финалния отговор. Форматът е задължителен: 1) кратко въведение 2–3 изречения; 2) номериран списък 5–10 точки, всяка с **удебелена теза**; 3) секция "Практически:" с bullet точки; 4) секция "Кога адвокат". Всяко правно твърдение завършва с инлайн цитат в квадратни скоби. Цитирай САМО норми от подадената нормативна база${citation ? ` (например ${citation})` : ""}. Ако няма проверена норма, не цитирай нищо и не измисляй член. Завърши с "(Обща информация, не правен съвет.)".`,
        },
        { role: "system", content: params.legalPromptBlock.slice(0, 5000) },
        { role: "user", content: `Въпрос/уточнения:\n${params.question}\n\nЧернова за преработване:\n${params.draft}` },
      ],
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function buildLegalCaseClarificationArgs(userMsg: string): any {
  const lower = userMsg.toLowerCase();
  if (/домашн|насил|заповед\s+за\s+защита|зздн|заплашв/.test(lower)) {
    return {
      mode: "legal_case",
      contextSummary: "За да насоча правилно по ЗЗДН/НК, трябва да уточним риска и дали вече има официални действия.",
      questions: [
        { id: "official_action", label: "Има ли вече официално действие?", type: "choice", required: true, options: ["Само заплахи/конфликт", "Подаден е сигнал", "Получих призовка", "Има молба/заповед за защита"] },
        { id: "evidence", label: "Имате ли доказателства?", type: "choice", required: true, options: ["Съобщения/чат", "Свидетели", "Медицински документ", "Нямам доказателства"] },
        { id: "urgency", label: "Има ли непосредствен риск?", type: "choice", required: true, options: ["Да, днес/сега", "Има риск, но не спешно", "Не", "Не съм сигурен/сигурна"] },
      ],
    };
  }
  if (/уволн|работодател|работник|трудов|предизвест|дисциплинар|съкращ/.test(lower)) {
    return {
      mode: "legal_case",
      contextSummary: "За точен трудов отговор трябва да уточним документа, срока и основанието.",
      questions: [
        { id: "document_received", label: "Връчен ли е писмен документ?", type: "choice", required: true, options: ["Да — заповед/предизвестие", "Само устно", "Получих проект", "Не"] },
        { id: "ground", label: "Какво основание е посочено?", type: "choice", required: true, options: ["Съкращаване", "Дисциплинарно", "По взаимно съгласие", "Не е ясно"] },
        { id: "deadline", label: "Има ли срок за реакция?", type: "choice", required: true, options: ["Да — до 7 дни", "Да — до 1 месец", "Не виждам срок", "Не знам"] },
      ],
    };
  }
  return {
    mode: "legal_case",
    contextSummary: "За да отговоря като правен казус, трябва да уточним процедурата, доказателствата и риска.",
    questions: [
      { id: "stage", label: "На какъв етап е казусът?", type: "choice", required: true, options: ["Само спор/заплаха", "Има официален документ", "Има подадена жалба/иск", "Има съд/орган"] },
      { id: "goal", label: "Каква е целта Ви?", type: "choice", required: true, options: ["Да се защитя", "Да подам жалба/искане", "Да отговоря писмено", "Да преценя риска"] },
      { id: "documents", label: "Имате ли документи/доказателства?", type: "choice", required: true, options: ["Да — писмени", "Да — свидетели", "Само устни факти", "Не съм сигурен/сигурна"] },
    ],
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const corr = crypto.randomUUID();
  const json = (payload: Record<string, unknown>, status: number, extra?: Record<string, string>) =>
    new Response(JSON.stringify({ ...payload, correlation_id: corr }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra ?? {}) },
    });

  // Ключът на доставчика СЕ ЧЕТЕ по-късно: удостоверяване, валидация на тялото,
  // собственост и само-четящо търсене трябва да работят и без него.
  // Ако моделът вече е стартиран, НИКАКВА неочаквана грешка не бива да остави
  // хода „в процес“ завинаги. Този пазач нанася доказуем преход към изравняване.
  let reconcileOnUnexpected: ((reason: string) => Promise<void>) | null = null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    // ---- Тяло: ЗАДЪЛЖИТЕЛЕН operation_id + САМО новото съобщение ------------
    const body = await req.json().catch(() => null);
    const operationId = typeof body?.operationId === "string" ? body.operationId.trim() : "";
    if (!UUID_RE.test(operationId)) {
      return json({ error: "Липсва валиден идентификатор на заявката.", code: "operation_id_required" }, 400);
    }
    // Идентичността на заявката е ТОЧНА: нищо не се отрязва тихо, за да не се
    // обвърже и запише текст, различен от изпратения.
    const rawMessage = typeof body?.message === "string" ? body.message : "";
    const newMessage = rawMessage.trim();
    if (!newMessage) {
      return json({ error: "Съобщението е задължително.", code: "message_required" }, 400);
    }
    if (rawMessage.length > HISTORY_CHARS_LIMIT) {
      return json({
        error: `Съобщението е твърде дълго. Максимум ${HISTORY_CHARS_LIMIT} знака.`,
        code: "message_too_long",
      }, 400);
    }
    // Подаден, но невалиден разговор НЕ се подменя тихо с нов.
    const rawThreadId = body?.threadId;
    let requestedThreadId: string | null = null;
    if (rawThreadId !== undefined && rawThreadId !== null && rawThreadId !== "") {
      if (typeof rawThreadId !== "string" || !UUID_RE.test(rawThreadId)) {
        return json({ error: "Невалиден разговор.", code: "invalid_thread_id" }, 400);
      }
      requestedThreadId = rawThreadId;
    }
    const currentPath = sanitizeChatPath(body?.currentPath);

    // ---- Безплатни проверки ПРЕДИ всяка резервация --------------------------
    const blockedChat = await guardIllegalContent({
      admin,
      text: newMessage,
      functionName: "assistant-chat",
      userId,
      userEmail: u?.user?.email ?? null,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blockedChat) return blockedChat;

    const chatClassification = classifyDocumentBeforeAI(newMessage);
    if (chatClassification.contains_special_category_data) {
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: "",
        classification: chatClassification, redaction_applied: false,
        status: "blocked", error_code: "special_category_in_chat",
      });
      return json({
        error: "Молим не споделяйте чувствителни лични данни (здравни, биометрични, синдикални, политически, религиозни) в чата.",
        code: "special_category_blocked",
      }, 422);
    }

    const requestedCtxParse = parseRequestedDocumentContext(body?.documentContext ?? null);
    const requestedContext: { kind: string; entityId: string } | null | "invalid" =
      requestedCtxParse.ok ? requestedCtxParse.value : "invalid";

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    // ---- Собственост на разговора и ревизия (безплатно) --------------------
    let existingThread: ThreadBinding | null | "not_found" = null;
    let priorTurnRevision = 0;
    if (requestedThreadId) {
      const { data: th } = await admin
        .from("assistant_threads")
        .select("id, user_id, context_kind, context_entity_id, context_version, context_title, turn_revision")
        .eq("id", requestedThreadId)
        .maybeSingle();
      existingThread = th
        ? {
            userId: (th as any).user_id,
            contextKind: (th as any).context_kind ?? null,
            contextEntityId: (th as any).context_entity_id ?? null,
            contextVersion: (th as any).context_version ?? null,
          }
        : "not_found";
      priorTurnRevision = Number((th as any)?.turn_revision ?? 0);
    }

    let resolvedContext: ResolvedDocumentContext | null = null;
    let resolutionFailure: "document_not_found" | "analysis_context_stale" | null = null;
    if (requestedContext && requestedContext !== "invalid") {
      const resolution = await resolveDocumentContext(userClient, requestedContext as any);
      if (resolution.ok) resolvedContext = resolution.value;
      else resolutionFailure = resolution.code;
    }

    // ---- Валидност и собственост на контекста: безплатна типизирана грешка --
    // Тази проверка НЕ чете план, квота или екип: правата се избират едва след
    // като само-четящото търсене покаже, че ходът наистина е нов.
    const contextGate = decideAssistantOrchestration({
      userId,
      requestedContext,
      existingThread,
      resolved: resolvedContext ? { version: resolvedContext.version } : null,
      resolutionFailure,
      plan: { teamId: null, isPro: false },
    });
    if (!contextGate.ok) {
      return json({ error: contextGate.error, code: contextGate.code }, contextGate.status);
    }

    // ---- Сървърна история: САМО четене, безплатно, преди обвързването -------
    // Клиентски препис НЕ се приема. Историята участва в решението за режим,
    // затова се чете преди каноничното обвързване и преди резервацията.
    const history = requestedThreadId ? await loadThreadHistory(admin, requestedThreadId) : [];
    if (history === null) {
      return json({
        error: "Разговорът не може да бъде прочетен в момента. Опитайте отново след минута.",
        code: "history_unavailable",
      }, 503);
    }
    const safeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history,
      { role: "user", content: newMessage },
    ];
    const lastUserMsg = newMessage;

    // ---- Режим: помощ / детерминистично уточняване / строг правен режим -----
    const modeDecision = decideTurnMode(newMessage, !!resolvedContext);
    const clarificationTurn = modeDecision.mode === "legal_strict" &&
      needsLegalClarification({ message: newMessage, history });
    const turnMode: TurnMode = clarificationTurn ? "clarification" : modeDecision.mode;

    const binding = await canonicalTurnBinding({
      userId,
      requestedThreadId,
      actualThreadId: requestedThreadId,
      message: newMessage,
      contextKind: resolvedContext?.kind ?? null,
      contextEntityId: resolvedContext?.entityId ?? null,
      contextVersion: resolvedContext?.version ?? null,
      priorTurnRevision,
      mode: turnMode,
      path: currentPath,
    });

    const replayResponse = (result: Record<string, unknown>) => {
      const events = Array.isArray(result.events) ? result.events : [];
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const ev of events) {
            const e = ev as { event?: unknown; data?: unknown };
            const name = typeof e?.event === "string" && e.event ? `event: ${e.event}\n` : "";
            controller.enqueue(encoder.encode(`${name}data: ${JSON.stringify(e?.data ?? null)}\n\n`));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    };

    const ledgerStateResponse = (
      kind: "in_progress" | "reconciliation" | "conflict" | "response_expired" | "unavailable",
    ): Response => {
      if (kind === "in_progress") {
        return json({
          error: "Този въпрос вече се обработва. Изчакайте отговора — не изпращайте повторно.",
          code: "assistant_turn_in_progress",
        }, 409, { "Retry-After": "5" });
      }
      if (kind === "conflict") {
        return json({
          error: "Заявката не съвпада с предишната. Изпратете съобщението отново.",
          code: "assistant_turn_conflict",
        }, 409);
      }
      if (kind === "response_expired") {
        return json({
          error: "Отговорът вече не е запазен. Изпратете съобщението отново.",
          code: "assistant_turn_response_expired",
        }, 409);
      }
      if (kind === "reconciliation") {
        return json({
          error: "Изясняваме състоянието на предишния Ви въпрос. Опитайте отново след малко — ако се повтори, свържете се с поддръжката.",
          code: "assistant_turn_reconciliation",
        }, 503);
      }
      return json({
        error: "Услугата е временно недостъпна. Опитайте отново след минута.",
        code: "assistant_turn_unavailable",
      }, 503);
    };

    // ---- САМО-ЧЕТЯЩО търсене ПРЕДИ права, ключ на доставчика и правна база --
    // Завършен ход се възпроизвежда дори когато ключът на доставчика липсва и
    // когато нормативната база е недостъпна: това е вече платен резултат.
    const lookup = await lookupTurn(admin, operationId, userId, binding);
    if (lookup.kind === "committed") return replayResponse(lookup.result);
    if (lookup.kind !== "absent") return ledgerStateResponse(lookup.kind);

    // ---- Ключ на доставчика: нужен е само когато наистина ще има модел или
    // строга проверка на нормативната база. Помощта за платформата работи и без.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY && turnMode !== "platform_help") {
      return json({ error: "Услугата е временно недостъпна.", code: "ai_gateway_unconfigured" }, 503);
    }

    // ---- Права и разпределение: СЛЕД като ходът е доказано нов --------------
    const { data: quota } = await admin
      .from("download_quota")
      .select("plan, pro_until, pro_monthly_used")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro = quota?.plan === "pro" || (quota?.pro_until && new Date(quota.pro_until) > new Date());

    let isEntrepreneur = false;
    if (isPro) {
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("price_id, status")
        .eq("user_id", userId)
        .in("status", ["active", "trialing", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      isEntrepreneur = String((subRow as any)?.price_id || "").startsWith("entrepreneur");
    }

    let teamId: string | null = null;
    if (!isPro) {
      const { data: tm } = await admin
        .from("team_members")
        .select("team_id, teams!inner(status)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const t: any = tm;
      if (t && t.teams?.status === "active") teamId = t.team_id;
    }

    const decision = decideAssistantOrchestration({
      userId,
      requestedContext,
      existingThread,
      resolved: resolvedContext ? { version: resolvedContext.version } : null,
      resolutionFailure,
      plan: { teamId, isPro: !!isPro },
    });
    if (!decision.ok) {
      return json({ error: decision.error, code: decision.code }, decision.status);
    }

    // ---- Правната основа: fail-closed за всяко правно твърдение -------------
    // Важи и за детерминистичното уточняване: ако няма проверена основа, не
    // задаваме правни въпроси и НЕ таксуваме.
    let legal: Awaited<ReturnType<typeof retrieveLegalContext>> | null = null;
    if (turnMode === "legal_strict" || turnMode === "clarification") {
      legal = await retrieveLegalContext(admin, LOVABLE_API_KEY!, newMessage, { matchCount: 10 });
      if (!legal.hasMatches) {
        const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
        return legalVerificationUnavailableResponse({ headers: corsHeaders });
      }
    }

    // ---- Резервация: точно едно право, точно една ревизия -------------------
    // Уточняващият ход НЕ се таксува: няма извикване на модел.
    const charge = turnMode === "legal_strict";
    const reserved = await reserveTurn(admin, {
      operationId,
      userId,
      binding,
      requestedThreadId,
      mode: turnMode,
      charge,
      allocationSource: charge ? decision.path : null,
      teamId,
      leaseSeconds: 180,
      newThread: requestedThreadId
        ? null
        : {
            title: newMessage.slice(0, 80),
            context_kind: resolvedContext?.kind ?? null,
            context_entity_id: resolvedContext?.entityId ?? null,
            context_version: resolvedContext?.version ?? null,
            context_title: resolvedContext?.title ?? null,
          },
      freeAiCap: FREE_AI_MESSAGES,
    });
    if (reserved.kind === "replay") return replayResponse(reserved.result);
    if (reserved.kind === "denied") {
      const reason = reserved.reason;
      const message = reason === "team_limit_reached"
        ? "Месечният лимит на екипа е достигнат."
        : reason === "ai_plan_limit_reached"
          ? "Месечният лимит на плана Ви е достигнат."
          : reason === "ai_free_limit_reached"
            ? "Безплатните съобщения за този месец са изчерпани."
            : "Заявката не може да бъде изпълнена с текущия Ви план.";
      return json({ error: message, code: reason }, 402);
    }
    if (reserved.kind === "invalid") {
      return json({ error: "Заявката е невалидна.", code: "assistant_turn_invalid" }, 400);
    }
    if (reserved.kind !== "reserved") {
      return ledgerStateResponse(
        reserved.kind === "conflict"
          ? (reserved.reason === "thread_busy" ? "in_progress" : "conflict")
          : reserved.kind,
      );
    }
    const activeThreadId = reserved.threadId;

    /** Провален път ПРЕДИ доставчика: доказана отмяна с точно връщане. */
    const cancelAndRespond = async (
      code: string,
      message: string,
      status: number,
    ): Promise<Response> => {
      const cancelled = await cancelTurn(admin, operationId, userId, code);
      if (cancelled.kind === "cancelled") return json({ error: message, code }, status);
      if (cancelled.kind === "reconciliation") return ledgerStateResponse("reconciliation");
      return ledgerStateResponse("unavailable");
    };

    // ---- Буфериран транскрипт: НИЩО не се доставя преди commit -------------
    const events: Array<{ event: string | null; data: unknown }> = [];
    const emit = (event: string | null, data: unknown) => { events.push({ event, data }); };

    emit("meta", {
      threadId: activeThreadId,
      citations: legal?.citations ?? [],
      documentContext: resolvedContext
        ? {
            kind: resolvedContext.kind,
            entityId: resolvedContext.entityId,
            version: resolvedContext.version,
            title: resolvedContext.title,
            truncated: false,
          }
        : null,
    });

    /** Едно атомарно записване на точно една двойка съобщения. */
    const commitDeterministic = async (assistantMessage: string): Promise<Response> => {
      const committed = await commitTurn(admin, {
        operationId,
        userId,
        userMessage: newMessage,
        assistantMessage,
        events,
        proposal: null,
      });
      if (committed.kind === "committed" || committed.kind === "replay") {
        return replayResponse(committed.result);
      }
      if (committed.kind === "response_expired") return ledgerStateResponse("response_expired");
      if (committed.kind === "conflict") return ledgerStateResponse("conflict");
      return ledgerStateResponse("unavailable");
    };

    // ---- РЕЖИМ „помощ за платформата“: без модел, без такса ----------------
    if (turnMode === "platform_help") {
      const answer = modeDecision.deterministicAnswer ?? platformHelpAnswer(newMessage);
      emit("progress", { step: "done", label: "Готово", status: "done" });
      emit(null, { delta: answer });
      emit("final_text", { content: answer });
      emit("followups", { followups: modeDecision.followups ?? [] });
      return await commitDeterministic(answer);
    }

    // ---- РЕЖИМ „уточняване“: детерминистично, без модел, без такса ---------
    if (turnMode === "clarification") {
      const clarificationArgs = buildLegalCaseClarificationArgs(lastUserMsg);
      const preamble =
        "Преди да дам правен отговор, трябва да уточним няколко факта. Те променят приложимия режим, сроковете и това дали говорим за превенция, защита или вече започнала процедура.\n\n";
      emit(null, { delta: preamble });
      emit("tool_call", {
        id: `tc_legal_${crypto.randomUUID()}`,
        name: "ask_clarification",
        args: clarificationArgs,
      });
      emit("followups", {
        followups: ["Отговори на въпросите", "Опиши документите", "Посочи спешността"],
      });
      emit("progress", { step: "done", label: "Готово", status: "done" });
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: "forced-clarification",
        classification: chatClassification, redaction_applied: false, status: "ok",
      }).catch(() => {});
      return await commitDeterministic(preamble);
    }


    // =====================  СТРОГ ПРАВЕН РЕЖИМ  =============================
    const verifiedLegal = legal!;
    const ctxLines = [
      `Потребителски статус: ${teamId ? "Екип" : isEntrepreneur ? "Предприемач" : isPro ? "Професионалист" : "Безплатен"}.`,
      currentPath ? `Текуща страница: ${currentPath}.` : "",
    ].filter(Boolean).join(" ");
    // Провал ПРЕДИ доставчика: доказана отмяна с точно връщане на правото.
    let activePrompt: Awaited<ReturnType<typeof loadActivePromptMeta>>;
    try {
      activePrompt = await loadActivePromptMeta(admin, "assistant-chat", SYSTEM_PROMPT);
    } catch (_) {
      return await cancelAndRespond(
        "prompt_unavailable",
        "Услугата е временно недостъпна. Опитайте отново след минута.",
        503,
      );
    }
    const uniqueActs = new Set(verifiedLegal.chunks.map((c) => c.short_code).filter(Boolean)).size;
    const chunkCount = verifiedLegal.chunks.length;
    const systemFinal = `${activePrompt.content}\n\n[КОНТЕКСТ] ${ctxLines}\n\n${verifiedLegal.promptBlock}`;
    const standardModel = activePrompt.model || MODEL_STANDARD;
    const premiumModel = activePrompt.premiumModel || MODEL_PREMIUM;

    let routerEnabled = true;
    let longTurnsThreshold = 6;
    let modelPrices: Record<string, { in: number; out: number }> = {};
    try {
      const { data: settings } = await admin
        .from("ai_simulation_settings" as any)
        .select("router_enabled, router_long_turns_threshold, model_prices")
        .eq("id", true)
        .maybeSingle();
      if (settings) {
        routerEnabled = (settings as any).router_enabled !== false;
        longTurnsThreshold = (settings as any).router_long_turns_threshold ?? 6;
        modelPrices = ((settings as any).model_prices ?? {}) as any;
      }
    } catch (_) { /* defaults */ }

    const userTurnCount = safeMessages.filter((m) => m.role === "user").length;
    const isHighRiskClass = chatClassification.risk_level === "high";
    const isLongConvo = userTurnCount >= longTurnsThreshold;
    const shouldEscalate = routerEnabled && (isHighRiskClass || isLongConvo);
    const chatModel = isEntrepreneur || shouldEscalate ? premiumModel : standardModel;

    let tools = toolSchemasFor(FULL_TOOL_NAMES);

    const lastLower = lastUserMsg.toLowerCase();
    // Едно определение за „потребителят е дал текст за проверка“ — същото, което
    // решава дали ходът е уточняване. Без две разминаващи се евристики.
    const analysisIntent = analysisIntentOf(lastUserMsg);
    const hasBgn = /\b(лв\.?|лева|BGN|стотинки)\b/i.test(lastUserMsg);
    const hasNumber = /\b\d{2,}\b/.test(lastUserMsg);
    const isBroadLegalQ = /(мрз|минимална\s+(работна\s+)?заплата|ддс|осигуров|дневн(и|о)\s+пар|обезщет|командиров)/i.test(lastLower);
    const isLaborCase = /(уволн|прекратяв(ане|а)\s+на\s+труд|чл\.?\s*32[68]\s*кт|чл\.?\s*71\s*кт|предизвестие|дисциплинарн|съкращ|отпуск\s+по\s+майч|болничен|трудов\s+спор|обезщетение\s+за\s+уволнение)/i.test(lastLower);

    const recentAssistantContents = safeMessages
      .filter((m) => m.role === "assistant")
      .slice(-4)
      .map((m) => String(m.content || "").toLowerCase());
    const tooManyClarifications = recentAssistantContents.filter((c) =>
      /уточн|нека уточним|за да е точен документът|моля посочете|моля уточнете/.test(c)
    ).length >= 2;

    const intentNudges: string[] = [];
    intentNudges.push(
      "❗ ГОВОРИ ПРЕДИ ТУЛ: ВИНАГИ пиши поне 2–3 изречения обяснителен текст ПРЕДИ да извикаш какъвто и да е tool (включително `ask_clarification`, `open_upload_analyzer`, `prefill_build_contract`). Празен отговор + tool call е забранен.",
    );
    intentNudges.push(
      "❗ ЕДИН TOOL НА ХОД: В един отговор не викай повече от 1 client tool. Не викай два пъти един и същ tool (`ask_clarification` × 2 = забранено).",
    );
    if (analysisIntent) {
      intentNudges.push(
        "❗ АНАЛИЗ НА ДОГОВОР: потребителят е поставил конкретен текст или иска проверка. След 2–3 обяснителни изречения извикай `open_upload_analyzer` — НЕ `ask_clarification`, НЕ анализирай клауза по клауза в чата.",
      );
    }
    if (hasBgn) {
      intentNudges.push(
        "❗ ВАЛУТА (СТРИКТНО): в целия отговор НЕ трябва да остане нито едно число, следвано от 'лв.', 'лева' или 'стотинки'. Всички суми преизчисли по 1 € = 1,95583 лв. и пиши САМО във вида '767 €'.",
      );
    }
    if (hasBgn && hasNumber) {
      intentNudges.push(
        "❗ ЗАБРАНЕНО ПЪРВО ХОД `ask_clarification`, ако потребителят вече е дал числова сума. Първо: (1) конвертирай в €, (2) дай кратка същинска оценка (3–5 изречения), (3) предложи конкретен шаблон, и ЕДВА ТОГАВА питай за детайли.",
      );
    }
    if (isBroadLegalQ) {
      intentNudges.push(
        "❗ ЗАКОНОВ ПРАГ/СТАВКА: НЕ давай числа по памет за МРЗ/ДДС/осигуровки/командировъчни. Обясни механиката и посочи компетентния акт/орган.",
      );
    }
    if (isLaborCase) {
      intentNudges.push(
        "❗ ТРУДОВ КАЗУС: обясни условно приложимия режим и цитирай САМО норми, които присъстват в [НОРМАТИВНА БАЗА].",
      );
    }
    if (tooManyClarifications) {
      intentNudges.push(
        "❗ СТИГА УТОЧНЕНИЯ: Вече попита ≥2 пъти. ЗАБРАНЕНО е ново `ask_clarification`. Продължи с `propose_contract_outline` или `prefill_build_contract` с разумни default-и.",
      );
    }
    intentNudges.push(
      "❗ ЦИТАТИ (СТРИКТНО): цитирай САМО източник, който е подаден в [НОРМАТИВНА БАЗА] — или с номера на извадката (`[S1]`, `[S2]`), или с точния етикет на нормата (`[ЗЗД, чл. 79]`). ЗАБРАНЕНО е да измисляш номер извън подадените извадки, да пишеш „източник N“ или „приложим общ режим“. Ако нормата не е в базата, не цитирай нищо.",
    );

    const legalCaseIntent =
      /(съди|съдят|заплашв|призовк|производств|обвин|разследв|жалба\s+срещу|подадена\s+жалба|нарушен|нападн|насил|развод|издръжк|запор|глоб|дискриминац|тормоз|мобинг|имам\s+ли\s+право|могат\s+ли\s+да|какво\s+да\s+правя|какви\s+са\s+ми\s+правата|какво\s+ми\s+грози|как\s+да\s+се\s+защит|заповед\s+за\s+защита|домашно\s+насилие)/i
        .test(lastUserMsg);
    const docBuildIntent =
      /(изготв(и|ете)|направ(и|ете)|създа(й|йте)|попълн(и|ете)|generate|шаблон|бланк|prefill)/i
        .test(lastUserMsg);
    const priorClarifiedInThread = safeMessages.some((m) =>
      m.role === "assistant" && /уточн|нека уточним|моля посочете|моля уточнете/i.test(String(m.content || ""))
    );
    const userProvidedLegalClarifications = safeMessages.some((m) =>
      m.role === "user" && /Ето\s+уточненията\s+по\s+казуса|Продължи\s+с\s+дълъг\s+структуриран\s+правен\s+отговор/i.test(String(m.content || ""))
    );
    // Детерминистичното уточняване се решава ПРЕДИ резервацията и излиза по
    // собствен път, затова тук е винаги изключено.
    const needsStructuredLegalAnswer =
      (legalCaseIntent || priorClarifiedInThread || userProvidedLegalClarifications) &&
      !docBuildIntent;
    if (needsStructuredLegalAnswer) {
      intentNudges.push(
        "❗ STRUCTURED_ANSWER: (1) 2–3 въвеждащи изречения; (2) НОМЕРИРАН списък 5–10 точки с **удебелена теза**; (3) BULLET списък „Практически:“; (4) „Кога адвокат“.",
      );
      intentNudges.push(
        "❗ CITE_VERIFIED_ONLY: правно твърдение се придружава с цитат САМО ако нормата е в [НОРМАТИВНА БАЗА]. Без сигурен цитат — не твърди нормата.",
      );
    }
    const nudgeBlock = intentNudges.join("\n");

    let contextMapping: RedactionMapping | null = null;
    let contextTruncated = false;
    const contextSystemBlocks: ChatMsg[] = [];
    if (resolvedContext) {
      const built = buildRedactedContextSystemBlock({
        kind: resolvedContext.kind,
        title: resolvedContext.title,
        body: resolvedContext.body,
        redact: redactForAI,
      });
      contextTruncated = built.truncated;
      contextMapping = built.mapping as RedactionMapping;
      contextSystemBlocks.push(built.message);
    }

    let proposalThisTurn = false;
    let pendingProposal: Record<string, unknown> | null = null;
    const editToolAvailable =
      !!resolvedContext && resolvedContext.kind === "saved_document" && !contextTruncated;
    if (editToolAvailable) {
      tools = toolSchemasFor([...FULL_TOOL_NAMES, SAVED_DOCUMENT_EDIT_TOOL]);
      contextSystemBlocks.push({
        role: "system",
        content:
          "# РЕДАКЦИЯ НА ИЗБРАНИЯ ЗАПАЗЕН ДОКУМЕНТ\n" +
          "- Когато потребителят иска промяна в текста, извикай `propose_saved_document_edit`.\n" +
          "- Това е ПРЕДЛОЖЕНИЕ: документът НЕ се променя, докато потребителят не натисне „Приеми“.\n" +
          "- Максимум ЕДНО предложение на ход и само за съществуващ елемент.",
      });
    }

    const convo: ChatMsg[] = [
      { role: "system", content: systemFinal },
      { role: "system", content: `# INTENT HINTS (за текущия ход)\n${nudgeBlock}` },
      ...contextSystemBlocks,
      ...safeMessages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const restoreLeaves = (text: string): string =>
      contextMapping ? unredact(text, contextMapping) : text;

    emit("progress", { step: "analyze", label: "Анализ на въпроса", status: "done" });
    emit("progress", {
      step: "found",
      label: `Намерих ${uniqueActs} нормативни акта и ${chunkCount} релевантни извадки`,
      status: "done",
    });

    // ---- Доставчик: ТОЧНО ЕДНО изпълнение, с деклариран таван --------------
    const started = await markTurnModelStarted(admin, operationId, userId);
    if (!started.ok) {
      // Доказан конфликт (вече стартиран/не е резервиран) е изравняване, защото
      // друго изпълнение може вече да е извикало модела. Неясен отговор от
      // самото маркиране също е изравняване, никога втори модел.
      await markTurnReconciliation(
        admin,
        operationId,
        userId,
        started.conflict ? "model_start_conflict" : "model_start_unknown",
      );
      return ledgerStateResponse("reconciliation");
    }
    reconcileOnUnexpected = async (reason: string) => {
      await markTurnReconciliation(admin, operationId, userId, reason);
    };

    let providerRequests = 0;
    let fullAssistantText = "";
    let lastModelStatus = 200;
    let providerFailed = false;
    const toolEvents: Array<{ event: string; data: unknown }> = [];

    try {
      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        if (providerRequests >= MAX_CHAT_REQUESTS_PER_OPERATION) break;
        providerRequests++;
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: chatModel,
            stream: true,
            max_tokens: needsStructuredLegalAnswer ? LEGAL_ANSWER_MAX_TOKENS : undefined,
            tools,
            messages: convo,
          }),
        });
        lastModelStatus = aiResp.status;
        if (!aiResp.ok || !aiResp.body) {
          providerFailed = true;
          break;
        }

        const reader = aiResp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let textThisTurn = "";
        const toolAcc: Map<number, { id: string; name: string; args: string }> = new Map();
        const scrubber = makeStreamScrubber({ citationCount: verifiedLegal.citations.length });

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const dat = t.slice(5).trim();
            if (dat === "[DONE]") continue;
            let parsed: any;
            try { parsed = JSON.parse(dat); } catch { continue; }
            const delta = parsed?.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.content === "string" && delta.content.length > 0) {
              textThisTurn += scrubber.push(delta.content);
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === "number" ? tc.index : 0;
                const existing = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (typeof tc.function?.arguments === "string") existing.args += tc.function.arguments;
                toolAcc.set(idx, existing);
              }
            }
          }
        }
        textThisTurn += scrubber.flush();
        fullAssistantText += textThisTurn;

        if (toolAcc.size === 0) break;

        const seenNames = new Set<string>();
        const toolCallsArr = Array.from(toolAcc.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, v]) => ({
            id: v.id || `tc_${crypto.randomUUID()}`,
            type: "function" as const,
            function: { name: v.name, arguments: v.args || "{}" },
          }))
          .filter((tc) => {
            if (seenNames.has(tc.function.name)) return false;
            seenNames.add(tc.function.name);
            return true;
          });

        convo.push({ role: "assistant", content: textThisTurn || null, tool_calls: toolCallsArr });

        const clientCalls = toolCallsArr.filter((tc) => !isServerTool(tc.function.name));
        const serverCalls = toolCallsArr.filter((tc) => isServerTool(tc.function.name));

        for (const sc of serverCalls) {
          let result: unknown;
          try {
            const args = safeParse(sc.function.arguments || "{}");
            if (sc.function.name === "search_templates") {
              result = await execSearchTemplates(admin, args);
            } else if (sc.function.name === SAVED_DOCUMENT_EDIT_TOOL) {
              if (!editToolAvailable || !resolvedContext) {
                result = { ok: false, code: "edit_not_available" };
              } else if (proposalThisTurn) {
                result = { ok: false, code: "one_proposal_per_turn" };
              } else {
                // САМО изчисление: записът става АТОМАРНО в commit.
                const computed = await computeSavedDocumentEditProposal({
                  reader: userClient,
                  writer: admin,
                  userId,
                  threadId: activeThreadId,
                  documentId: resolvedContext.entityId,
                  contextVersion: resolvedContext.version,
                  contextTruncated,
                  restore: restoreLeaves,
                }, args as any);
                if (computed.ok) {
                  proposalThisTurn = true;
                  pendingProposal = computed.insert as unknown as Record<string, unknown>;
                  result = {
                    ok: true,
                    proposal: {
                      status: "pending",
                      targetPath: computed.insert.target_path,
                      before: computed.insert.before_text,
                      after: computed.insert.after_text,
                      reason: computed.insert.reason,
                      savedDocumentId: computed.insert.saved_document_id,
                      threadId: activeThreadId,
                    },
                    note: "Предложението чака изричното решение на потребителя. Документът не е променен.",
                  };
                } else {
                  result = { ok: false, code: computed.code };
                }
              }
            } else {
              result = { error: "unknown_tool" };
            }
          } catch (_e) {
            result = { error: "tool_exec_failed" };
          }
          convo.push({ role: "tool", tool_call_id: sc.id, content: JSON.stringify(result) });
          toolEvents.push({
            event: "tool_result",
            data: { id: sc.id, name: sc.function.name, args: safeParse(sc.function.arguments), result },
          });
          const r = result as any;
          if (sc.function.name === "search_templates" && r && Array.isArray(r.items) && r.items.length === 0) {
            convo.push({
              role: "system",
              content: "❗ SEARCH_EMPTY: `search_templates` върна 0 резултата. Извикай `propose_contract_outline` или `prefill_build_contract` (documentType='generic').",
            });
          }
        }

        if (clientCalls.length > 0 && textThisTurn.trim().length === 0) {
          const firstName = clientCalls[0].function.name;
          const preamble = (() => {
            switch (firstName) {
              case "open_upload_analyzer":
                return "Разбрах — ще Ви пренасоча към проверката, за да прегледаме качения текст.\n\n";
              case "ask_clarification":
                return "Имам достатъчно контекст, но първо нека уточним няколко детайла:\n\n";
              case "prefill_build_contract":
                return "Отварям документа с попълнени данни от разговора. Ще можете да прегледате всяко поле.\n\n";
              case "propose_contract_outline":
                return "Ето предложение за структурата според това, което споделихте:\n\n";
              case "open_template":
                return "Отварям документа в каталога, за да видите пълния текст.\n\n";
              default:
                return "Продължавам със следваща стъпка:\n\n";
            }
          })();
          textThisTurn += preamble;
          fullAssistantText += preamble;
        }

        for (const cc of clientCalls) {
          const validated = validateClientToolArgs(cc.function.name, safeParse(cc.function.arguments));
          if (validated.ok) {
            toolEvents.push({ event: "tool_call", data: { id: cc.id, name: cc.function.name, args: validated.args } });
          } else {
            convo.push({ role: "tool", tool_call_id: cc.id, content: JSON.stringify({ error: validated.reason }) });
          }
        }

        if (serverCalls.length === 0 && clientCalls.length > 0) break;
      }
    } catch (_err) {
      providerFailed = true;
    }

    // Несигурност СЛЕД стартиран модел => изравняване, никога втори модел.
    if (providerFailed) {
      // БЕЗ отмяна и БЕЗ връщане на квота: моделът вече е стартиран, затова
      // състоянието се решава от изравняването, не от тази заявка. Записваме
      // ДОКАЗУЕМ преход в леджъра — не само HTTP отговор.
      await markTurnReconciliation(admin, operationId, userId, `provider_${lastModelStatus}`);
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: chatModel,
        classification: chatClassification, redaction_applied: false,
        status: "error", error_code: `http_${lastModelStatus}`,
      }).catch(() => {});
      return ledgerStateResponse("reconciliation");
    }

    const lastToolName = (() => {
      for (let i = toolEvents.length - 1; i >= 0; i--) {
        const d = toolEvents[i].data as { name?: unknown };
        if (typeof d?.name === "string") return d.name;
      }
      return null;
    })();

    const { cleaned: rawCleaned, followups } = parseFollowups(fullAssistantText);
    let cleaned = sanitizeAssistantReply(rawCleaned, {
      citationCount: verifiedLegal.citations.length,
      injectRiskBanner: false,
    });

    // Едно ОГРАНИЧЕНО поправяне в СЪЩАТА резервация (в декларирания таван).
    let citationCheck = validateAnswerCitations(cleaned, verifiedLegal.citations as any, {
      requireCitation: needsStructuredLegalAnswer,
    });
    const structureBroken = needsStructuredLegalAnswer && needsLegalAnswerRepair(cleaned);
    if ((structureBroken || !citationCheck.ok) && providerRequests < MAX_CHAT_REQUESTS_PER_OPERATION) {
      providerRequests++;
      const repaired = await repairLegalAnswer({
        apiKey: LOVABLE_API_KEY!,
        model: premiumModel,
        question: lastUserMsg,
        draft: cleaned,
        legalPromptBlock: verifiedLegal.promptBlock,
        citations: verifiedLegal.citations,
      }).catch(() => null);
      if (repaired) {
        const candidate = sanitizeAssistantReply(repaired, {
          citationCount: verifiedLegal.citations.length,
          injectRiskBanner: false,
        });
        const recheck = validateAnswerCitations(candidate, verifiedLegal.citations as any, {
          requireCitation: needsStructuredLegalAnswer,
        });
        if (recheck.ok) {
          cleaned = candidate;
          citationCheck = recheck;
        }
      }
    }

    // Непроверен цитат НИКОГА не се доставя — черновата не се показва.
    if (!citationCheck.ok) {
      cleaned = noVerifiedAnswerText();
    }

    if (HIGH_RISK_RE.test(lastUserMsg) && !HIGH_RISK_ESCALATION_MARK.test(cleaned)) {
      cleaned = `${cleaned}\n\n${highRiskBanner()}`.trim();
    }
    cleaned = restoreLeaves(cleaned);

    const finalFollowups = citationCheck.ok && followups.length >= 2
      ? followups
      : citationCheck.ok
        ? fallbackFollowups(lastToolName)
        : ["Задай по-конкретен въпрос", "Качи документ за проверка", "Намери шаблон"];

    if (cleaned.trim()) emit(null, { delta: cleaned });
    for (const te of toolEvents) {
      if (citationCheck.ok) emit(te.event, te.data);
    }
    if (cleaned.trim()) emit("final_text", { content: cleaned });
    emit("followups", { followups: finalFollowups });
    emit("progress", { step: "done", label: "Готово", status: "done" });

    const committed = await commitTurn(admin, {
      operationId,
      userId,
      userMessage: newMessage,
      assistantMessage: cleaned.trim() ? cleaned : null,
      events,
      proposal: citationCheck.ok ? pendingProposal : null,
    });
    if (committed.kind !== "committed" && committed.kind !== "replay") {
      if (committed.kind === "conflict") return ledgerStateResponse("conflict");
      if (committed.kind === "response_expired") return ledgerStateResponse("response_expired");
      // Неясно потвърждаване СЛЕД стартиран модел: доказуемо изравняване.
      await markTurnReconciliation(admin, operationId, userId, "commit_unavailable");
      return ledgerStateResponse("reconciliation");
    }
    // Потвърденото е неприкосновено: пазачът вече не бива да го пипа.
    reconcileOnUnexpected = null;


    await logAiAudit({
      user_id: userId, operation: "assistant-chat", model: chatModel,
      classification: chatClassification, redaction_applied: false, status: "ok",
    }).catch(() => {});
    try {
      const inputChars = convo.reduce((a, m) => a + String(m.content || "").length, 0);
      const tIn = Math.ceil(inputChars / 4);
      const tOut = Math.ceil(fullAssistantText.length / 4);
      const price = modelPrices[chatModel];
      const costEur = price ? +(((tIn / 1000) * price.in) + ((tOut / 1000) * price.out)).toFixed(6) : null;
      await admin.from("ai_usage").insert({
        user_id: userId, function_name: "assistant-chat",
        model: chatModel, tokens_in: tIn, tokens_out: tOut, cost_eur: costEur,
      });
    } catch (_e) { /* счетоводството за разход не е част от доставката */ }

    return replayResponse(committed.result);
  } catch (_err) {
    console.error("assistant-chat failed", corr);
    if (reconcileOnUnexpected) {
      await reconcileOnUnexpected("unexpected_after_model").catch(() => {});
      return json({
        error:
          "Изясняваме състоянието на предишния Ви въпрос. Опитайте отново след малко — ако се повтори, свържете се с поддръжката.",
        code: "assistant_turn_reconciliation",
      }, 503);
    }
    return json({ error: "Сървърна грешка", code: "assistant_chat_failed" }, 500);
  }
});

function safeParse(s: string): any {
  // Tolerant: tool-call argument JSON can arrive truncated mid-string.
  try { return extractJson(s || "{}", { report: false }); } catch { return {}; }
}

function validateClientToolArgs(name: string, args: any): { ok: true; args: any } | { ok: false; reason: string } {
  if (!args || typeof args !== "object") return { ok: false, reason: "args must be object" };
  if (name === "navigate") {
    const p = sanitizePath(args.path);
    if (!p) return { ok: false, reason: "invalid path" };
    return { ok: true, args: { path: p, reason: typeof args.reason === "string" ? args.reason.slice(0, 200) : undefined } };
  }
  if (name === "open_template") {
    if (typeof args.slug !== "string" || !/^[a-z0-9\-]{1,80}$/.test(args.slug)) {
      return { ok: false, reason: "invalid slug" };
    }
    return { ok: true, args: { slug: args.slug } };
  }
  if (name === "prefill_build_contract") {
    const clean: Record<string, unknown> = {};
    for (const k of ["documentType", "name", "partiesA", "partiesB", "subject"]) {
      if (typeof args[k] === "string") clean[k] = String(args[k]).slice(0, 500);
    }
    if (typeof args.bilingual === "boolean") clean.bilingual = args.bilingual;
    return { ok: true, args: clean };
  }
  if (name === "open_upload_analyzer") {
    return { ok: true, args: {} };
  }
  if (name === "ask_clarification") {
    const ctx = typeof args.contextSummary === "string" ? args.contextSummary.slice(0, 240) : "";
    const mode = args.mode === "legal_case" ? "legal_case" : "document_build";
    const qs = Array.isArray(args.questions) ? args.questions : [];
    const cleaned = qs.slice(0, 5).map((q: any, i: number) => ({
      id: typeof q?.id === "string" ? q.id.slice(0, 40).replace(/[^a-z0-9_]/gi, "_") : `q_${i}`,
      label: typeof q?.label === "string" ? q.label.slice(0, 120) : "",
      type: ["text", "choice", "number", "date"].includes(q?.type) ? q.type : "text",
      placeholder: typeof q?.placeholder === "string" ? q.placeholder.slice(0, 80) : undefined,
      options: Array.isArray(q?.options) ? q.options.slice(0, 6).map((o: any) => String(o).slice(0, 60)) : undefined,
      required: q?.required === true,
    })).filter((q: any) => q.label);
    if (cleaned.length === 0) return { ok: false, reason: "no valid questions" };
    return { ok: true, args: { contextSummary: ctx, mode, questions: cleaned } };
  }
  if (name === "propose_contract_outline") {
    const title = typeof args.title === "string" ? args.title.slice(0, 160) : "";
    if (!title) return { ok: false, reason: "missing title" };
    const clauses = Array.isArray(args.clauses) ? args.clauses : [];
    const cleanClauses = clauses.slice(0, 12).map((c: any) => ({
      heading: typeof c?.heading === "string" ? c.heading.slice(0, 100) : "",
      summary: typeof c?.summary === "string" ? c.summary.slice(0, 240) : "",
    })).filter((c: any) => c.heading);
    if (cleanClauses.length < 3) return { ok: false, reason: "need at least 3 clauses" };
    const prefill: Record<string, unknown> = {};
    if (args.prefill && typeof args.prefill === "object") {
      for (const k of ["name", "partiesA", "partiesB", "subject"]) {
        if (typeof args.prefill[k] === "string") prefill[k] = String(args.prefill[k]).slice(0, 500);
      }
      if (typeof args.prefill.bilingual === "boolean") prefill.bilingual = args.prefill.bilingual;
    }
    return {
      ok: true,
      args: {
        title,
        documentType: typeof args.documentType === "string" ? args.documentType.slice(0, 80) : undefined,
        basedOnTemplateSlug: typeof args.basedOnTemplateSlug === "string" && /^[a-z0-9\-]{1,80}$/.test(args.basedOnTemplateSlug) ? args.basedOnTemplateSlug : undefined,
        clauses: cleanClauses,
        prefill,
      },
    };
  }
  return { ok: false, reason: "unknown tool" };
}

// Generate fallback followups when the model forgets to emit <followups>.
function fallbackFollowups(lastToolName: string | null): string[] {
  switch (lastToolName) {
    case "search_templates":
      return ["Отвори първия", "Покажи още шаблони", "Попълни нов от нула"];
    case "ask_clarification":
      return ["Попълни автоматично", "Покажи шаблона", "Започни отначало"];
    case "propose_contract_outline":
      return ["Потвърди и попълни", "Промени клаузите", "Покажи правно основание"];
    case "prefill_build_contract":
      return ["Изтегли PDF", "Сподели за подпис", "Анализирай за рискове"];
    case "open_template":
      return ["Попълни данните", "Покажи още варианти", "Промени езика на BG/EN"];
    case "open_upload_analyzer":
      return ["Качи документ за анализ", "Намери подходящ шаблон", "Обясни клауза"];
    case "navigate":
      return ["Намери шаблон", "Попълни нов договор", "Качи документ за анализ"];
    default:
      return ["Намери шаблон", "Попълни нов договор", "Качи документ за анализ"];
  }
}

const FOLLOWUPS_TAG = /<followups>([\s\S]*?)<\/followups>/i;

// Keep all followups that look like real chips. Only filter out empties,
// overly long strings, and pure theory questions ending with a question mark
// AND starting with an interrogative — those don't drive action.
const PURE_THEORY_RE = /^(какво|защо|кой|къде)\b[^?]*\?\s*$/i;

function isActionable(chip: string): boolean {
  const c = chip.trim();
  if (c.length === 0 || c.length > 70) return false;
  if (PURE_THEORY_RE.test(c)) return false;
  return true;
}

function parseFollowups(raw: string): { cleaned: string; followups: string[] } {
  if (!raw) return { cleaned: raw, followups: [] };
  const m = raw.match(FOLLOWUPS_TAG);
  if (!m) return { cleaned: raw, followups: [] };
  const list = m[1]
    .split(/\|\||\n/)
    .map((s) => s.trim().replace(/^[-•\d.)\s]+/, ""))
    .filter(isActionable)
    .slice(0, 4);
  return { cleaned: raw.replace(FOLLOWUPS_TAG, "").trim(), followups: list };
}


// All response-sanitizer helpers (BGN→€, [Sn] scrubber, streaming scrubber,
// чл.328 hallucination scrub, high-risk banner, fake case-law scrub,
// double-currency cleanup, outdated-year annotation) live in
// ../_shared/response-sanitizer.ts and are shared with assistant-chat-anon.


