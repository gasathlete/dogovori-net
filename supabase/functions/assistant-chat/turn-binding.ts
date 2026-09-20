/**
 * P0-E2 — канонично обвързване на ЕДИН ход на асистента и разделянето на
 * режимите.
 *
 * Принципи:
 *  - Обвързването покрива ТОЧНО това, което определя резултата: потребител,
 *    заявен/реален разговор, точното ново съобщение, контекстът на документа
 *    (вид, обект, версия, отпечатък) и режимът. Нищо от браузъра не влиза в
 *    сметката в суров вид.
 *  - Режимът е fail-closed: само тесен, детерминистичен списък от въпроси за
 *    самата платформа минава без правна база и без модел. Всичко останало е
 *    строг правен режим с проверени източници.
 */

export type TurnMode = "platform_help" | "legal_strict" | "clarification";

export interface TurnBindingInput {
  userId: string;
  requestedThreadId: string | null;
  actualThreadId: string | null;
  /** Точният нов текст на потребителя (без история). */
  message: string;
  contextKind: string | null;
  contextEntityId: string | null;
  contextVersion: string | null;
  /** Ревизия на разговора ПРЕДИ този ход (нов разговор = 0). */
  priorTurnRevision: number;
  mode: TurnMode;
  /** Изчистен път на страницата — без query, без hash, без пълен URL. */
  path: string;
}

/** Каноничен път: само пътят, до 120 знака, без query/hash. */
export function sanitizeChatPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const onlyPath = raw.split("#")[0].split("?")[0].trim();
  if (!onlyPath.startsWith("/")) return "";
  if (!/^\/[A-Za-z0-9\-_/]{0,119}$/.test(onlyPath)) return "";
  return onlyPath.slice(0, 120);
}

function canonicalPayload(input: TurnBindingInput): string {
  return JSON.stringify([
    "assistant_turn_v1",
    input.userId,
    input.requestedThreadId ?? "new_thread",
    input.actualThreadId ?? "new_thread",
    input.priorTurnRevision,
    input.mode,
    input.contextKind ?? "",
    input.contextEntityId ?? "",
    input.contextVersion ?? "",
    input.path,
    input.message,
  ]);
}

/** Каноничен SHA-256 в малки букви. */
export async function canonicalTurnBinding(input: TurnBindingInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPayload(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* -------------------------------------------------------------------------
 * Разделяне на режимите. Детерминистично и тясно.
 * ------------------------------------------------------------------------- */

/** Признаци за правна или документна същина — веднага строг правен режим. */
const LEGAL_SUBSTANCE_RE =
  /(чл\.?\s*\d|ал\.?\s*\d|закон|кодекс|ззд|тз\b|кт\b|зут|гпк|нк\b|нпк|регламент|директив|съд|дело|иск|жалб|призовк|прокурат|полиц|неустойк|обезщет|наем|договор|клауз|анекс|пълномощн|nda|уволн|прекратяв|отговорност|давност|срок|права|правен|юрид|развод|издръжк|наслед|запор|глоб|данък|ддс|осигуров|гдпр|gdpr|лични данни)/i;

/** Тесен списък от въпроси за самата платформа. */
const PLATFORM_HELP_RE =
  /(здравей|здравейте|добър ден|добро утро|добър вечер|как(во|ъв)? (мога|може) да (правиш|правите|ми помогнеш)|какво правиш|кой си ти|как работи (сайт|платформ|систем)|къде (да )?(наме|кач[ае]|изтегля)|как (да )?(кач[ае]|изтегля|запазя|намеря шаблон|създам профил|сменя парола|отпиша|абонирам)|как се (плаща|абонирам)|какви (планове|цени|абонамент)|цена на (план|абонамент)|моят профил|моя профил|моите документи|къде са ми документите|как да се свържа|поддръжка|как да изтрия профила)/i;

export interface ModeDecision {
  mode: TurnMode;
  /** Детерминистичен отговор — само за platform_help. */
  deterministicAnswer?: string;
  followups?: string[];
}

/**
 * Fail-closed: `platform_help` само ако съобщението е кратко, съвпада с
 * разрешения списък И няма никаква правна/документна същина. Всичко останало
 * (включително двусмислено) е строг правен режим.
 */
export function decideTurnMode(message: string, hasDocumentContext: boolean): ModeDecision {
  const text = (message || "").trim();
  if (!text) return { mode: "legal_strict" };
  if (hasDocumentContext) return { mode: "legal_strict" };
  if (text.length > 220) return { mode: "legal_strict" };
  if (LEGAL_SUBSTANCE_RE.test(text)) return { mode: "legal_strict" };
  if (!PLATFORM_HELP_RE.test(text)) return { mode: "legal_strict" };
  return {
    mode: "platform_help",
    deterministicAnswer: platformHelpAnswer(text),
    followups: ["Намери шаблон", "Изготви документ", "Качи документ за проверка"],
  };
}

/**
 * Детерминистичен отговор за платформата. НЕ съдържа правно твърдение, НЕ
 * цитира норми и НЕ се генерира от модел.
 */
export function platformHelpAnswer(text: string): string {
  const lower = text.toLowerCase();
  const intro = /(здравей|добър ден|добро утро|добър вечер)/.test(lower)
    ? "Здравейте! Аз съм DogovaryAI — помагам Ви да намерите, изготвите и проверите документ в Dogovori.net.\n\n"
    : "";
  if (/(планове|цени|абонамент|плаща)/.test(lower)) {
    return `${intro}Плановете и цените са описани на страницата „Планове“. Там виждате какво включва всеки план и колко операции имате на месец. Еднократните услуги за проверка и поправка на документ са отделни и не изискват абонамент.\n\nАко искате, отворете „Планове“ от менюто или ми кажете какъв документ Ви трябва.`;
  }
  if (/(каче|изтегля|провер)/.test(lower)) {
    return `${intro}Качвате документ през „Качване и проверка“. Избирате файла, ние прочитаме текста и Ви показваме резултата, който можете да свалите.\n\nАко предпочитате да изготвите нов документ, използвайте „Изготви“.`;
  }
  if (/(профил|документите|парола|изтрия)/.test(lower)) {
    return `${intro}Вашите документи, данни и настройки са в „Профил“. Там можете да видите запазените документи, да смените паролата и да управлявате абонамента си.`;
  }
  if (/(шаблон|наме)/.test(lower)) {
    return `${intro}Каталогът съдържа готови документи, подредени по тема. Търсите по ключова дума, отваряте документа и го попълвате стъпка по стъпка.`;
  }
  return `${intro}Мога да Ви помогна да намерите готов документ в каталога, да изготвите нов стъпка по стъпка или да проверите свой документ преди подпис. Кажете ми с какво да започнем.`;
}

/* -------------------------------------------------------------------------
 * Детерминистично уточняване. Решава се ПРЕДИ резервацията, САМО от точното
 * ново съобщение и СЪРВЪРНАТА история. Клиентски препис не се приема.
 * ------------------------------------------------------------------------- */

const LEGAL_CASE_INTENT_RE =
  /(съди|съдят|заплашв|призовк|производств|обвин|разследв|жалба\s+срещу|подадена\s+жалба|нарушен|нападн|насил|развод|издръжк|запор|глоб|дискриминац|тормоз|мобинг|имам\s+ли\s+право|могат\s+ли\s+да|какво\s+да\s+правя|какви\s+са\s+ми\s+правата|какво\s+ми\s+грози|как\s+да\s+се\s+защит|заповед\s+за\s+защита|домашно\s+насилие)/i;

const DOC_BUILD_INTENT_RE =
  /(изготв(и|ете)|направ(и|ете)|създа(й|йте)|попълн(и|ете)|generate|шаблон|бланк|prefill)/i;

const CLARIFIED_ASSISTANT_RE = /уточн|нека уточним|моля посочете|моля уточнете/i;
const CLARIFIED_USER_RE =
  /Ето\s+уточненията\s+по\s+казуса|Продължи\s+с\s+дълъг\s+структуриран\s+правен\s+отговор/i;

/** Потребителят е поставил конкретен текст/клауза или иска проверка. */
export function analysisIntentOf(message: string): boolean {
  const text = message || "";
  const lower = text.toLowerCase();
  const longQuotedBlock = /(['"„][^'"„“]{120,}['"“”])/.test(text);
  const multilineLegalBlock = text.length > 400 && /\n/.test(text) &&
    /(чл\.?\s*\d+|ал\.?\s*\d+|неустой|отговорн|прекрат|страни(те)?\s+се\s+съглас|настоящ(ия|ият)\s+договор)/i
      .test(lower);
  const asked =
    /(провер(и|ете)|анализира(й|йте)|прегледа(й|йте)|коректен ли е|валиден ли е|има ли риск|ревизира(й|йте))/i
      .test(text) &&
    /'[^']{40,}'|"[^"]{40,}"|„[^"]{40,}“|клауз|договор|текст/i.test(lower);
  return asked || longQuotedBlock || multilineLegalBlock;
}

export interface ClarificationInput {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * `true` когато първият ход по правен казус ТРЯБВА да е уточняване. Това е
 * детерминистичен ход: без модел и без такса, но със същата строга проверка за
 * наличие на правна основа.
 */
export function needsLegalClarification(input: ClarificationInput): boolean {
  const message = input.message || "";
  if (!LEGAL_CASE_INTENT_RE.test(message)) return false;
  if (DOC_BUILD_INTENT_RE.test(message)) return false;
  if (analysisIntentOf(message)) return false;
  const history = Array.isArray(input.history) ? input.history : [];
  const priorClarified = history.some((m) =>
    m.role === "assistant" && CLARIFIED_ASSISTANT_RE.test(String(m.content || ""))
  );
  if (priorClarified) return false;
  const userClarified = history.some((m) =>
    m.role === "user" && CLARIFIED_USER_RE.test(String(m.content || ""))
  );
  return !userClarified;
}
