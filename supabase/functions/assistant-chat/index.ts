// DogovaryAI assistant with tool calling. Streams text to client via SSE,
// loops on server-side tool calls (search_templates), and forwards client-side
// tool calls (navigate, prefill_build_contract, open_upload_analyzer,
// open_template) to the browser through a custom SSE event.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt, loadActivePromptMeta } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { retrieveLegalContext } from "../_shared/legal-rag.ts";
import {
  ASSISTANT_TOOLS,
  FULL_TOOL_NAMES,
  execSearchTemplates,
  isServerTool,
  sanitizePath,
  toolSchemasFor,
} from "../_shared/assistant-tools.ts";

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

# ВЕРИГА НА ДЕЙСТВИЯ (СТРИКТНО)
Когато потребителят споменe документ (договор, жалба, молба, заявление, пълномощно, анекс, NDA, протокол, оферта, декларация, спогодба и т.н.):

**Стъпка 1 — Търсене.** ВИНАГИ започвай с \`search_templates\` (използвай 2–5 ключови думи: тип документ + ключови термини от заявката).

**Стъпка 2 — Уточняване.** Ако липсват критични данни (страни, предмет, срок, цена/възнаграждение, особености) — извикай \`ask_clarification\` с 2–5 кратки въпроса. НЕ задавай въпроси, на които потребителят вече е отговорил. Реши кои са критичните полета според типа документ:
- Трудов договор: страни, длъжност, заплата, срок (безсрочен/срочен), изпитателен срок
- Наем: наемодател, наемател, имот, наем, депозит, срок
- NDA: страни, предмет, срок, едностранно/двустранно
- Жалба/Молба: подател, адресат, основание, искане
- Услуги/Изработка: страни, предмет, цена, срок, приемане

**Стъпка 3 — Структура.** След получаване на отговорите (или ако имаш достатъчно данни от началото), извикай \`propose_contract_outline\` с план от 5–10 клаузи. Потребителят ще го потвърди.

**Стъпка 4 — Изпълнение.** След потвърждение → \`prefill_build_contract\` с попълнени стойности, ИЛИ \`open_template(slug)\` ако има точен шаблон, ИЛИ \`navigate("/build")\` като fallback.

Други случаи:
- **Анализ на договор (рискове, ревизия, „провери ми този договор", „коректен ли е този текст") → ВИНАГИ \`open_upload_analyzer\`.** НЕ анализирай поставен във чата текст клауза по клауза — насочи към /analyze където работи целият пайплайн (OCR, класификация, риск-скор, корекции, подпис). В чата позволено е САМО кратко обяснение какво ще намери анализатора (1–2 изречения) + tool call.
- Навигация (каталог, билинг, акаунт, workspace, комплекти, подпис) → \`navigate(path)\`. Без markdown линкове. Канонични пътища по-долу.
- Правен въпрос без документ → отговор + цитат от [НОРМАТИВНА БАЗА], после \`<followups>\` с команда за действие.

# КРИТИЧНИ ЗАБРАНИ
- ❌ "Нямам достъп", "няма такъв шаблон", "за съжаление", "не разполагам с" — БЕЗ да си извикал поне 1 tool.
- ❌ Прескачане на \`ask_clarification\` при липсващи критични данни — резултатът ще е лош prefill.
- ❌ Повече от 1 client tool на ход. Един tool, чакаш резултат, продължаваш следващия ход.
- ❌ Markdown линкове за вътрешна навигация — използвай \`navigate\`.
- ❌ Никога не симулирай функционалност, която платформата вече има (анализ на документ, генериране на PDF, изпращане за подпис, изчисляване на риск-скор, OCR). Винаги навигирай към съответния модул вместо да „правиш го" в чата.

# СТИЛ
Български, на "Вие". Кратко (макс 4–5 реда текст преди tool). Markdown с **bold**. Цитати — само от [НОРМАТИВНА БАЗА], формат \`[чл. 79 ЗЗД](URL)\`.

# КОМПЕТЕНЦИИ
600+ шаблона (business, real-estate, employment, it). Wizard, risk-анализ, ShareForSign, е-подпис, PDF/DOCX, двуезични договори (BG/EN/DE/FR/RU/ES/IT), Комплекти за казуси. ЗЗД, ТЗ, КТ, СК, ЗУТ, ДОПК, GDPR/ЗЗЛД. Актуални планове (EUR): Безплатен / **Предприемач 12.90 €/мес (100 операции/мес)** / **Екип 10.90 €/място/мес (мин. 3 места = 32.70 €/мес, 100 оп./място)**. Top-up пакети (само активни абонати): 10/2.90 €, 20/5.40 €, 50/12.90 €, 100/23.90 €. ДДС 20% включен.

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
- ✅ Приоритет на CTA с глагол ("Попълни договор", "Изтегли PDF", "Анализирай качен файл", "Отвори шаблон", "Сподели за подпис", "Активирай план").
- ✅ Разрешено е и уточняващо предложение, АКО води към действие ("Срочен или безсрочен?", "Жилищен или офис наем?") — за да помогнеш на потребителя да избере правилния шаблон.
- ❌ Без чисто теоретични/учебни въпроси ("Какво е неустойка?") освен ако са свързани с конкретен документ.
- Винаги поне 1 CTA chip. Без \`<followups>\` отговорът е невалиден.`;

const MODEL_STANDARD = "google/gemini-3-flash-preview";
const MODEL_PREMIUM = "openai/gpt-5.2";
const MAX_TOOL_ITERATIONS = 8;

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI gateway не е конфигуриран" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    const threadId: string | null = body?.threadId ?? null;
    const currentPath: string = typeof body?.currentPath === "string" ? body.currentPath.slice(0, 200) : "";
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages е задължителен" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeMessages = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
    if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "Последното съобщение трябва да е от потребителя" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blockedChat = await guardIllegalContent({
      admin,
      text: safeMessages[safeMessages.length - 1].content,
      functionName: "assistant-chat",
      userId,
      userEmail: u?.user?.email ?? null,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blockedChat) return blockedChat;

    const lastUserMsg = safeMessages[safeMessages.length - 1].content;
    const chatClassification = classifyDocumentBeforeAI(lastUserMsg);
    if (chatClassification.contains_special_category_data) {
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: "",
        classification: chatClassification, redaction_applied: false,
        status: "blocked", error_code: "special_category_in_chat",
      });
      return new Response(JSON.stringify({
        error: "Молим не споделяйте чувствителни лични данни (здравни, биометрични, синдикални, политически, религиозни) в чата.",
        code: "special_category_blocked",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paid individual / team gate
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
      const pid = (subRow as any)?.price_id || "";
      isEntrepreneur = pid.startsWith("entrepreneur");
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

    if (!isPro && !teamId) {
      return new Response(JSON.stringify({
        error: "AI асистентът е достъпен само за Професионалист, Предприемач и Екип.",
        code: "subscription_required",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Thread management
    let activeThreadId = threadId;
    if (activeThreadId) {
      const { data: th } = await admin
        .from("assistant_threads")
        .select("id, user_id")
        .eq("id", activeThreadId)
        .maybeSingle();
      if (!th || th.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Разговорът не е намерен" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const firstUser = safeMessages.find((m: any) => m.role === "user");
      const title = (firstUser?.content ?? "Нов разговор").slice(0, 80);
      const { data: created } = await admin
        .from("assistant_threads")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      activeThreadId = created?.id ?? null;
    }

    // Persist last user message
    const lastUser = safeMessages[safeMessages.length - 1];
    await admin.from("assistant_messages").insert({
      thread_id: activeThreadId,
      role: "user",
      content: lastUser.content,
    });

    // RAG
    const ctxLines = [
      `Потребителски статус: ${teamId ? "Екип" : isEntrepreneur ? "Предприемач" : "Професионалист"}.`,
      currentPath ? `Текуща страница: ${currentPath}.` : "",
    ].filter(Boolean).join(" ");
    const activePrompt = await loadActivePromptMeta(admin, "assistant-chat", SYSTEM_PROMPT);
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, lastUserMsg, {
      matchCount: 10,
      minSimilarity: 0.4,
    });
    const systemFinal = legal.hasMatches
      ? `${activePrompt.content}\n\n[КОНТЕКСТ] ${ctxLines}\n\n${legal.promptBlock}`
      : `${activePrompt.content}\n\n[КОНТЕКСТ] ${ctxLines}\n\n[НОРМАТИВНА БАЗА] Няма намерени релевантни нормативни извадки.`;

    const standardModel = activePrompt.model || MODEL_STANDARD;
    const premiumModel = activePrompt.premiumModel || MODEL_PREMIUM;

    // Smart cost-aware router: escalate to premium only when needed.
    // Settings live in ai_simulation_settings (single row).
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

    const userTurnCount = safeMessages.filter((m: any) => m.role === "user").length;
    const isHighRisk = chatClassification.risk_level === "high";
    const isLongConvo = userTurnCount >= longTurnsThreshold;
    const shouldEscalate = routerEnabled && (isHighRisk || isLongConvo);
    const chatModel = isEntrepreneur || shouldEscalate ? premiumModel : standardModel;
    const routerReason = isEntrepreneur
      ? "plan:entrepreneur"
      : shouldEscalate
        ? (isHighRisk ? "risk:high" : `long_convo:${userTurnCount}`)
        : "default:flash";
    console.log(`[router] model=${chatModel} reason=${routerReason}`);
    const tools = toolSchemasFor(FULL_TOOL_NAMES);

    // Intent hints — injected as an extra system nudge to steer the model on
    // ambiguous patterns where it would otherwise misfire (call the wrong tool
    // or ask for clarification when we have enough context).
    const lastLower = lastUserMsg.toLowerCase();
    // Detect pasted contract-like text even without explicit keywords
    const longQuotedBlock = /(['"„][^'"„"]{120,}['"""])/.test(lastUserMsg);
    const multilineLegalBlock = lastUserMsg.length > 400 && /\n/.test(lastUserMsg) &&
      /(чл\.?\s*\d+|ал\.?\s*\d+|неустой|отговорн|прекрат|страни(те)?\s+се\s+съглас|настоящ(ия|ият)\s+договор)/i.test(lastLower);
    const analysisIntent =
      (/(провер(и|ете)|анализира(й|йте)|прегледа(й|йте)|коректен ли е|валиден ли е|има ли риск|ревизира(й|йте))/i.test(lastUserMsg) &&
        (/'[^']{40,}'|"[^"]{40,}"|„[^"]{40,}"|клауз|договор|текст/i.test(lastLower))) ||
      longQuotedBlock || multilineLegalBlock;
    const hasBgn = /\b(лв\.?|лева|BGN|стотинки)\b/i.test(lastUserMsg);
    const hasNumber = /\b\d{2,}\b/.test(lastUserMsg);
    const isBroadLegalQ = /(мрз|минимална\s+(работна\s+)?заплата|ддс|осигуров|дневн(и|о)\s+пар|обезщет|командиров)/i.test(lastLower);
    const isLaborCase = /(уволн|прекратяв(ане|а)\s+на\s+труд|чл\.?\s*32[68]\s*кт|чл\.?\s*71\s*кт|предизвестие|дисциплинарн|съкращ|отпуск\s+по\s+майч|болничен|трудов\s+спор|обезщетение\s+за\s+уволнение)/i.test(lastLower);

    // Guard against endless ask_clarification loops:
    // count how many of the last 4 assistant turns already asked for clarification.
    const recentAssistantContents = safeMessages
      .filter((m: any) => m.role === "assistant")
      .slice(-4)
      .map((m: any) => String(m.content || "").toLowerCase());
    const priorClarificationCount = recentAssistantContents.filter((c: string) =>
      /уточн|нека уточним|за да е точен документът|моля посочете|моля уточнете/.test(c)
    ).length;
    const tooManyClarifications = priorClarificationCount >= 2;

    const intentNudges: string[] = [];
    // Baseline behaviour rule that fixes silent tool calls we observed in probes.
    intentNudges.push(
      "❗ ГОВОРИ ПРЕДИ ТУЛ: ВИНАГИ пиши поне 2–3 изречения обяснителен текст ПРЕДИ да извикаш какъвто и да е tool (включително `ask_clarification`, `open_upload_analyzer`, `prefill_build_contract`). Празен отговор + tool call е забранен.",
    );
    intentNudges.push(
      "❗ ЕДИН TOOL НА ХОД: В един отговор не викай повече от 1 client tool. Не викай два пъти един и същ tool (`ask_clarification` × 2 = забранено).",
    );
    if (analysisIntent) {
      intentNudges.push(
        "❗ АНАЛИЗ НА ДОГОВОР: потребителят е поставил конкретен текст или иска проверка. След 2–3 обяснителни изречения извикай `open_upload_analyzer` — НЕ `ask_clarification`, НЕ анализирай клауза по клауза в чата. Целият пайплайн (OCR, риск-скор, корекции) е в /analyze.",
      );
    }
    if (hasBgn) {
      intentNudges.push(
        "❗ ВАЛУТА (СТРИКТНО): в целия отговор НЕ трябва да остане нито едно число, следвано от 'лв.', 'лева' или 'стотинки'. Всички суми преизчисли по 1 € = 1,95583 лв. и пиши САМО във вида '767 €' или '≈ 767 €'. Дори в примери и пресмятания използвай евро. НЕ задавай уточняващ въпрос за валута.",
      );
    }
    if (hasBgn && hasNumber) {
      intentNudges.push(
        "❗ ЗАБРАНЕНО ПЪРВО ХОД `ask_clarification`, ако потребителят вече е дал числова сума. Първо: (1) конвертирай в €, (2) дай кратка същинска оценка/механика (3–5 изречения), (3) предложи конкретен шаблон с markdown link към https://dogovori.net/…, и ЕДВА ТОГАВА може да питаш за детайли.",
      );
    }
    if (isBroadLegalQ) {
      intentNudges.push(
        "❗ ЗАКОНОВ ПРАГ/СТАВКА: НЕ давай числа по памет за МРЗ/ДДС/осигуровки/командировъчни. Обясни механиката, посочи компетентния акт/орган (ПМС/ДВ/НАП/МТСП/НОИ) и препоръчай сверяване за 2026 г. Ако все пак посочваш стойност — задължително добави '(да се свери с актуалния акт за 2026 г.)'.",
      );
    }
    if (isLaborCase) {
      intentNudges.push(
        "❗ ТРУДОВ КАЗУС: НЕ казвай 'няма основание в наличната нормативна база' за общи институти от Кодекса на труда. Обясни условно приложимия режим (чл. 328 КТ — прекратяване по инициатива на работодателя с предизвестие; чл. 220 КТ — обезщетение при неспазено предизвестие; чл. 222 КТ — обезщетение при съкращаване; чл. 224 КТ — за неползван отпуск). Цитирай `[КТ, чл. NNN]` и препоръчай `open_upload_analyzer`, ако има връчен документ.",
      );
    }
    if (tooManyClarifications) {
      intentNudges.push(
        "❗ СТИГА УТОЧНЕНИЯ: Вече попита ≥2 пъти за уточнение. ЗАБРАНЕНО е ново `ask_clarification`. Продължи с `propose_contract_outline` или `prefill_build_contract` с наличните данни и разумни default-и (маркирай ги [DEFAULT]). Потребителят ще коригира във wizard-a.",
      );
    }
    intentNudges.push(
      "❗ ЦИТАТИ: НИКОГА не пиши маркери от вида [S1], [S2], [източник N]. Използвай САМО реалния кратък цитат `[ЗЗД, чл. 79]`, `[КТ, чл. 328]` и т.н. Ако нямаш сигурен цитат — пропусни го.",
    );
    const nudgeBlock = intentNudges.join("\n");

    // Build conversation
    const convo: ChatMsg[] = [
      { role: "system", content: systemFinal },
      { role: "system", content: `# INTENT HINTS (за текущия ход)\n${nudgeBlock}` },
      ...safeMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (event: string | null, data: unknown) => {
          const ev = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${ev}data: ${JSON.stringify(data)}\n\n`));
        };

        enqueue("meta", { threadId: activeThreadId, citations: legal.citations });

        let fullAssistantText = "";
        let iterations = 0;
        let lastModelStatus = 200;

        try {
          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: chatModel,
                stream: true,
                tools,
                messages: convo,
              }),
            });
            lastModelStatus = aiResp.status;

            if (!aiResp.ok || !aiResp.body) {
              const errText = await aiResp.text().catch(() => "");
              console.error("AI gateway error:", aiResp.status, errText.slice(0, 300));
              const errMsg = aiResp.status === 429
                ? "Лимитът е достигнат. Опитайте отново скоро."
                : aiResp.status === 402
                ? "Изчерпани AI кредити."
                : "AI грешка. Опитайте отново.";
              enqueue("error", { message: errMsg, status: aiResp.status });
              break;
            }

            // Parse stream — collect text + tool_calls assembly
            const reader = aiResp.body.getReader();
            let buffer = "";
            let textThisTurn = "";
            // tool_calls accumulator: index -> { id, name, args (string) }
            const toolAcc: Map<number, { id: string; name: string; args: string }> = new Map();
            // Buffered scrubber — safe across chunk boundaries:
            //  - converts BGN literals (лв./лева/BGN) → EUR at 1.95583
            //  - strips fake source markers [Sn] / [източник N]
            //  - hides the entire <followups>...</followups> block from the UI so
            //    users never see the raw tag flash before the chip render.
            const scrubber = makeStreamScrubber({ citationCount: legal.citations.length });

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
                const choice = parsed?.choices?.[0];
                const delta = choice?.delta;
                if (!delta) continue;
                if (typeof delta.content === "string" && delta.content.length > 0) {
                  const cleaned = scrubber.push(delta.content);
                  if (cleaned.length > 0) {
                    textThisTurn += cleaned;
                    enqueue(null, { delta: cleaned });
                  }
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

            // Flush any residual buffered text (last ~40 chars held back to allow
            // safe cross-chunk scrubbing) before we decide about tool preambles.
            const tail = scrubber.flush();
            if (tail.length > 0) {
              textThisTurn += tail;
              enqueue(null, { delta: tail });
            }

            fullAssistantText += textThisTurn;

            if (toolAcc.size === 0) {
              // Done — no tool calls
              enqueue(null, "[DONE]");
              break;
            }

            // We have tool calls. Append assistant message with tool_calls to convo.
            // Dedupe by function.name — the model sometimes emits the same client tool
            // twice in one turn (esp. ask_clarification), which spawns duplicate UI cards.
            const seenNames = new Set<string>();
            const toolCallsArr = Array.from(toolAcc.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, v]) => ({
                id: v.id || `tc_${Math.random().toString(36).slice(2)}`,
                type: "function" as const,
                function: { name: v.name, arguments: v.args || "{}" },
              }))
              .filter((tc) => {
                if (seenNames.has(tc.function.name)) return false;
                seenNames.add(tc.function.name);
                return true;
              });

            convo.push({
              role: "assistant",
              content: textThisTurn || null,
              tool_calls: toolCallsArr,
            });

            // Split server vs client tool calls.
            const clientCalls = toolCallsArr.filter((tc) => !isServerTool(tc.function.name));
            const serverCalls = toolCallsArr.filter((tc) => isServerTool(tc.function.name));

            // Execute server tools and feed back.
            for (const sc of serverCalls) {
              let result: unknown;
              try {
                const args = JSON.parse(sc.function.arguments || "{}");
                if (sc.function.name === "search_templates") {
                  result = await execSearchTemplates(admin, args);
                } else {
                  result = { error: "unknown_tool" };
                }
              } catch (e) {
                result = { error: "tool_exec_failed", message: e instanceof Error ? e.message : String(e) };
              }
              convo.push({
                role: "tool",
                tool_call_id: sc.id,
                content: JSON.stringify(result),
              });
              // Forward to client for UI rendering as well.
              enqueue("tool_result", {
                id: sc.id,
                name: sc.function.name,
                args: safeParse(sc.function.arguments),
                result,
              });
              // Nudge model when search returns nothing — otherwise it tends to say
              // "нямам подходящ шаблон" instead of falling back to prefill/outline.
              const r = result as any;
              if (sc.function.name === "search_templates" &&
                  r && Array.isArray(r.items) && r.items.length === 0) {
                convo.push({
                  role: "system",
                  content: "❗ SEARCH_EMPTY: `search_templates` върна 0 резултата. НЕ казвай на потребителя че нямаш шаблон. Вместо това извикай `propose_contract_outline` с разумна структура за поисканата тема ИЛИ `prefill_build_contract` (documentType='generic') и обясни, че платформата ще генерира договора от нулата чрез wizard-а.",
                });
              }
            }

            // Forward client tools — but they don't feed back into convo this turn.
            // The client will execute them. The model has already produced its
            // user-facing explanation in textThisTurn (per our system prompt).
            // Fallback: if the model emitted a client tool WITHOUT any accompanying
            // text (a Gemini quirk that leaves users staring at a blank bubble),
            // inject a short human-readable preamble matched to the tool name.
            if (clientCalls.length > 0 && textThisTurn.trim().length === 0) {
              const firstName = clientCalls[0].function.name;
              const preamble = (() => {
                switch (firstName) {
                  case "open_upload_analyzer":
                    return "Разбрах — ще Ви пренасоча към анализатора, за да прегледам качения текст и да маркирам рискови клаузи.\n\n";
                  case "ask_clarification":
                    return "Имам достатъчно контекст, за да продължа, но първо нека уточним няколко ключови детайла, за да е точен документът:\n\n";
                  case "prefill_build_contract":
                    return "Отварям съответния договор с попълнени данни от разговора. Ще можете да прегледате и коригирате всяко поле.\n\n";
                  case "propose_contract_outline":
                    return "Ето предложение за структурата на договора според това, което споделихте:\n\n";
                  case "open_template":
                    return "Отварям шаблона в каталога, за да можете да прегледате пълния текст.\n\n";
                  default:
                    return "Продължавам със следваща стъпка:\n\n";
                }
              })();
              enqueue(null, { delta: preamble });
              textThisTurn += preamble;
              fullAssistantText += preamble;
            }

            for (const cc of clientCalls) {
              const rawArgs = safeParse(cc.function.arguments);
              const validated = validateClientToolArgs(cc.function.name, rawArgs);
              if (validated.ok) {
                enqueue("tool_call", {
                  id: cc.id,
                  name: cc.function.name,
                  args: validated.args,
                });
              } else {
                // Bad args — give the model a chance to fix on next iteration.
                convo.push({
                  role: "tool",
                  tool_call_id: cc.id,
                  content: JSON.stringify({ error: validated.reason }),
                });
              }
            }

            // If only client tools were emitted, we can stop here.
            if (serverCalls.length === 0 && clientCalls.length > 0) {
              enqueue(null, "[DONE]");
              break;
            }
            // Otherwise loop to give the model server tool results.
          }
        } catch (err) {
          console.error("Stream loop error:", err);
          enqueue("error", { message: "Грешка при стрийминг" });
        } finally {
          // Parse followups from final text; if missing, fall back contextually.
          const lastToolName = (() => {
            // best-effort: scan convo backwards for the last assistant tool_calls
            for (let i = convo.length - 1; i >= 0; i--) {
              const m: any = convo[i];
              if (m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                return m.tool_calls[m.tool_calls.length - 1]?.function?.name ?? null;
              }
            }
            return null;
          })();
          const { cleaned: rawCleaned, followups } = parseFollowups(fullAssistantText);
          // Belt-and-suspenders post-stream sanitisers (idempotent on already-scrubbed text).
          let cleaned = scrubBgnLiterals(scrubChl328Hallucination(rawCleaned));

          // High-risk escalation banner — inject once if the case is serious
          // and the model didn't already recommend a lawyer/НБПП.
          const isHighRisk = HIGH_RISK_RE.test(lastUserMsg);
          if (isHighRisk && !HIGH_RISK_ESCALATION_MARK.test(cleaned)) {
            const banner = highRiskBanner();
            const bannerDelta = `\n\n${banner}\n`;
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: bannerDelta })}\n\n`));
            } catch { /* ignore */ }
            cleaned = `${cleaned}\n\n${banner}`.trim();
          }

          const finalFollowups = followups.length >= 2 ? followups : fallbackFollowups(lastToolName);
          try {
            controller.enqueue(new TextEncoder().encode(`event: followups\ndata: ${JSON.stringify({ followups: finalFollowups })}\n\n`));
          } catch { /* ignore */ }

          // Persist cleaned assistant message (no inline tag).
          if (cleaned.trim() && activeThreadId) {
            await admin.from("assistant_messages").insert({
              thread_id: activeThreadId,
              role: "assistant",
              content: cleaned,
            });
            await admin.from("assistant_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeThreadId);
          }

          await logAiAudit({
            user_id: userId, operation: "assistant-chat", model: chatModel,
            classification: chatClassification, redaction_applied: false,
            status: lastModelStatus === 200 ? "ok" : "error",
            error_code: lastModelStatus === 200 ? undefined : `http_${lastModelStatus}`,
          });

          // Cost estimation (chars/4 ≈ tokens) → ai_usage with cost_eur for live dashboard.
          try {
            const inputChars = convo.reduce((a, m) => a + String(m.content || "").length, 0);
            const outputChars = fullAssistantText.length;
            const tIn = Math.ceil(inputChars / 4);
            const tOut = Math.ceil(outputChars / 4);
            const price = modelPrices[chatModel];
            const costEur = price ? +(((tIn / 1000) * price.in) + ((tOut / 1000) * price.out)).toFixed(6) : null;
            await admin.from("ai_usage").insert({
              user_id: userId, function_name: "assistant-chat",
              model: chatModel, tokens_in: tIn, tokens_out: tOut, cost_eur: costEur,
            });
          } catch (e) { console.warn("ai_usage cost insert failed", e); }

          controller.close();
        }
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
  } catch (err) {
    console.error("assistant-chat error:", err);
    return new Response(JSON.stringify({ error: "Сървърна грешка" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function safeParse(s: string): any {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
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
    return { ok: true, args: { contextSummary: ctx, questions: cleaned } };
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


// Convert stray BGN literals into EUR at the official fixed rate.
// Matches numbers followed by 'лв.', 'лева' or 'BGN' — handles 1.234,56 and 1 234,56 formats.
const BGN_RATE = 1.95583;
const BGN_LITERAL_RE = /(\d{1,3}(?:[.\s\u00A0]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(лв\.?|лева|BGN)\b/gi;

function scrubBgnLiterals(text: string): string {
  if (!text || !/(лв|лева|BGN)/i.test(text)) return text;
  return text.replace(BGN_LITERAL_RE, (_m, num: string) => {
    const normalized = num
      .replace(/[\s\u00A0]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "") // thousands dot
      .replace(",", ".");
    const n = Number(normalized);
    if (!isFinite(n) || n <= 0) return `${num} €`;
    const eur = n / BGN_RATE;
    const formatted = eur >= 100
      ? Math.round(eur).toLocaleString("bg-BG")
      : eur.toFixed(2).replace(".", ",");
    return `${formatted} €`;
  });
}

// Chunk-boundary safe streaming scrubber.
// The gateway emits arbitrary chunk splits, which used to cause artefacts:
//   • "500 лв" split as "500 л" + "в"  → stayed as leva in the UI
//   • "[S1]" split as "[S" + "1]"     → the marker survived scrubbing
//   • "<followups>…</followups>"      → tag flashed before chip render
// This helper buffers the last ~40 chars, hides the followups block entirely,
// and only emits text that is guaranteed safe from a partial-match perspective.
// `citationCount` — how many real [НОРМАТИВНА БАЗА] entries the model was given.
// Markers [S1..S{citationCount}] survive; the rest are stripped as hallucinations.
function makeStreamScrubber(opts: { citationCount: number } = { citationCount: 0 }) {
  let pending = "";
  let followupsStarted = false;
  const TAIL = 40;
  const citCount = Math.max(0, opts.citationCount | 0);

  const stripFakeMarker = (marker: string, nStr: string) => {
    const n = parseInt(nStr, 10);
    return n >= 1 && n <= citCount ? marker : "";
  };

  const staticScrub = (s: string) =>
    scrubBgnLiterals(
      s
        .replace(/\[\s*S\s*(\d{1,2})\s*\]/gi, (m, n) => stripFakeMarker(m, n))
        .replace(/\[\s*източник\s*(\d{1,2})\s*\]/gi, (m, n) => stripFakeMarker(m, n)),
    );

  return {
    push(chunk: string): string {
      if (followupsStarted || !chunk) return "";
      pending += chunk;
      const openIdx = pending.search(/<followups\b/i);
      if (openIdx >= 0) {
        const safe = pending.slice(0, openIdx);
        pending = "";
        followupsStarted = true;
        return staticScrub(safe);
      }
      if (/<[a-z]{0,10}$/i.test(pending)) return "";
      if (pending.length <= TAIL) return "";
      const emitLen = pending.length - TAIL;
      const emit = pending.slice(0, emitLen);
      pending = pending.slice(emitLen);
      return staticScrub(emit);
    },
    flush(): string {
      if (followupsStarted) { pending = ""; return ""; }
      const out = staticScrub(pending);
      pending = "";
      return out;
    },
  };
}

// Post-stream sanitiser for persisted assistant text. Idempotent — safe to
// run on already-scrubbed content. Strips the persistent Gemini hallucination
// where the model claims "чл. 328 ЗЗД е отменен / не съществува".
function scrubChl328Hallucination(text: string): string {
  return text
    .replace(
      /(?:^|\s)[^.!?]*чл(?:ен|\.)?\s*328[^.!?]*(?:ЗЗД|Закон\s+за\s+задълженията)[^.!?]*(?:отмен|не\s+същест|няма\s+так)[^.!?]*[.!?]\s*/gi,
      " ",
    )
    .replace(
      /(?:^|\s)[^.!?]*(?:отмен|не\s+същест)[^.!?]*чл(?:ен|\.)?\s*328[^.!?]*(?:ЗЗД|Закон\s+за\s+задълженията)[^.!?]*[.!?]\s*/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

const HIGH_RISK_RE = /(арест|задържан|обвин|наказател|прокурат|полиц|съдебн(о|и)\s+заседание|дело\s+№|заповед\s+за\s+защита|домашн(о|и)\s+насил|отвлич|непълнолетн|малолетн|органи(те)?\s+на\s+ди|детск(а|и)\s+служб)/i;
const HIGH_RISK_ESCALATION_MARK = /адвокат|правна\s+помощ|национал(на|но)\s+бюро|нбпп/i;

function highRiskBanner(): string {
  return "⚠️ **Случаят изглежда високорисков.** Препоръчваме незабавна консултация с адвокат — можете да ползвате [Национално бюро за правна помощ](https://nbpp.government.bg) при доходов праг, или частен адвокат. DogovaryAI не заменя правен съветник при висящо производство.";
}

