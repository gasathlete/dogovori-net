/**
 * Q2c0 — ЕДИННА редакция и обвързване на ЦЕЛИЯ изходящ контекст на генератора.
 *
 * Проблемът, който това решава (възпроизведен с синтетични входове):
 * `parties.a` и `parties.b` минаваха през ОТДЕЛНИ `redactForAI` повиквания, а
 * броячите на плейсхолдъри започват от 1 при всяко повикване. Две различни
 * стойности получаваха един и същ плейсхолдър (`<EMAIL_1>`), а
 * `Object.assign(mergedMapping, a.mapping, b.mapping)` презаписваше мапинга на
 * страна А с този на страна Б. Резултатът: и двете страни се възстановяваха като
 * страна Б — детерминирано разместване на самоличности. `qaLines` рестартираше
 * броячите за трети път.
 *
 * Решение: ВСИЧКИ потребителски полета се редактират в ЕДИН проход с ЕДИН общ
 * мапинг. Мапингът живее само в паметта на заявката — не се логва и не се
 * записва. Доверените части (спецификация на вида документ, системни
 * инструкции) остават извън този корпус и не се редактират.
 *
 * Тук НЕ се променят данни на клиента и НЕ се пипа продуктова логика.
 */

import { redactForAI, type RedactionMapping } from "../_shared/redact.ts";
import { stableStringify } from "../_shared/normalize.ts";

/**
 * Служебен символ, който НЕ приемаме във входа (U+241E). Рамкирането вече е през
 * JSON масив, но входът с този символ остава отказан — fail-closed, без промяна
 * на досегашното поведение.
 */
const CONTROL_MARK = "\u241E";


/** Плейсхолдъри, които САМИ генерираме. Ако вече присъстват във входа, не можем
 * да различим потребителски текст от наш маркер → отказваме безопасно. */
const RESERVED_PLACEHOLDER_RE = /<(?:EMAIL|IBAN|ID_CARD|EGN|PHONE|ADDRESS|NAME)_\d+>/;

/** Версия на политиката за кеш. Всяка промяна тук обезсилва СТАРИТЕ записи,
 * без да ги трие — старите ключове просто никога не се улучват отново. */
export const GENERATOR_CACHE_POLICY_VERSION = "q2c0-context-bound-1";

/** Един въпрос от съветника — етикетът е потребителски видим текст и излиза навън. */
export interface GeneratorQa {
  id: string;
  label: string;
  answer: string;
}

/** Целият потребителски (недоверен) изходящ контекст на генератора. */
export interface GeneratorContext {
  sector: string;
  contractName: string;
  documentName: string;
  partyA: string;
  partyB: string;
  /** Име/линк на арбитражния съд, както е подаден от клиента. */
  arbitrationCourt: string;
  /** Незадължителен езиков контекст (напр. пояснение за двуезичния режим). */
  languageContext: string;
  qa: GeneratorQa[];
}

export interface GeneratorContextError {
  ok: false;
  code: "context_not_redactable";
  message: string;
}

export interface RedactedGeneratorContext {
  ok: true;
  redactionApplied: boolean;
  context: GeneratorContext;
  /** placeholder -> оригинална стойност. Никога не се логва и не се записва. */
  mapping: RedactionMapping;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/**
 * Изгражда контекста от суровото тяло на заявката. Редът на въпросите се пази
 * такъв, какъвто клиентът го е подал — той участва и в идентичността на кеша.
 * Празните отговори се изпускат (както досега), за да не се хабят токени.
 */
export function buildGeneratorContext(input: {
  sector?: unknown;
  contractName?: unknown;
  documentName?: unknown;
  parties?: unknown;
  questions?: unknown;
  answers?: unknown;
  arbitration?: unknown;
  languageContext?: unknown;
}): GeneratorContext | GeneratorContextError {
  const questions = input.questions;
  if (!Array.isArray(questions)) return notRedactable();
  const answers =
    input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)
      ? (input.answers as Record<string, unknown>)
      : {};
  const parties =
    input.parties && typeof input.parties === "object" && !Array.isArray(input.parties)
      ? (input.parties as Record<string, unknown>)
      : {};
  const arbitration =
    input.arbitration && typeof input.arbitration === "object" && !Array.isArray(input.arbitration)
      ? (input.arbitration as Record<string, unknown>)
      : null;

  const qa: GeneratorQa[] = [];
  for (const raw of questions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return notRedactable();
    const q = raw as Record<string, unknown>;
    if (typeof q.id !== "string") return notRedactable();
    const label = str(q.label);
    const answer = str(answers[q.id]);
    if (answer.trim() === "") continue;
    qa.push({ id: q.id, label, answer });
  }

  const courtEnabled = arbitration?.enabled === true;
  const arbitrationCourt = courtEnabled
    ? str(arbitration?.courtName) || str(arbitration?.courtId)
    : "";

  return {
    sector: str(input.sector),
    contractName: str(input.contractName),
    documentName: str(input.documentName),
    partyA: str(parties.a),
    partyB: str(parties.b),
    arbitrationCourt,
    languageContext: str(input.languageContext),
    qa,
  };
}

function notRedactable(): GeneratorContextError {
  return {
    ok: false,
    code: "context_not_redactable",
    message:
      "Подадените данни не могат да бъдат обработени безопасно. Проверете отговорите и опитайте отново.",
  };
}

/** Всички низови листа в реда, в който ги възстановяваме след редакцията. */
function collectFields(ctx: GeneratorContext): string[] | null {
  if (!ctx || typeof ctx !== "object" || !Array.isArray(ctx.qa)) return null;
  const fields: string[] = [];
  const push = (v: unknown): boolean => {
    if (typeof v !== "string") return false;
    // Fail-closed: служебен разделител или вече наличен наш плейсхолдър.
    if (v.includes(CONTROL_MARK)) return false;
    if (RESERVED_PLACEHOLDER_RE.test(v)) return false;
    fields.push(v);
    return true;
  };
  if (!push(ctx.sector) || !push(ctx.contractName) || !push(ctx.documentName)) return null;
  if (!push(ctx.partyA) || !push(ctx.partyB)) return null;
  if (!push(ctx.arbitrationCourt) || !push(ctx.languageContext)) return null;
  for (const q of ctx.qa) {
    if (!q || typeof q !== "object") return null;
    if (!push(q.label) || !push(q.answer)) return null;
  }
  return fields;
}

/**
 * Корпусът за класификация — ЦЕЛИЯТ потребителски контекст, който излиза навън,
 * а не само страните. Така решението „блокирай/поискай потвърждение" се взима
 * върху същите данни, които после биха тръгнали към модела.
 */
export function buildGeneratorClassificationCorpus(ctx: GeneratorContext): string {
  const fields = collectFields(ctx);
  if (fields) return fields.join("\n");
  // Дори при непроходим контекст класификацията вижда наличния текст —
  // редакцията все пак ще откаже да изпрати нещо.
  const parts = [ctx?.sector, ctx?.contractName, ctx?.documentName, ctx?.partyA, ctx?.partyB];
  for (const q of Array.isArray(ctx?.qa) ? ctx.qa : []) parts.push(q?.label, q?.answer);
  return parts.filter((p): p is string => typeof p === "string").join("\n");
}

/** Временен маркер при пренумерирането — входът с него се отказва по-долу. */
const TEMP_MARK = "\u0000";

/**
 * Редактира всяко поле поотделно, но с ЕДИН общ мапинг и ЕДИН общ брояч на
 * плейсхолдъри. Връща `null` при непроходим вход (fail-closed).
 */
function redactFieldsWithSharedMapping(
  fields: string[],
): { parts: string[]; mapping: RedactionMapping } | null {
  const mapping: RedactionMapping = {};
  const byValue = new Map<string, string>();
  const counters = new Map<string, number>();
  const parts: string[] = [];

  for (const field of fields) {
    if (field.includes(TEMP_MARK)) return null;
    const local = redactForAI(field);
    let text = local.redacted;
    const temps: Array<[string, string]> = [];
    // Дълги плейсхолдъри първи (<EMAIL_10> преди <EMAIL_1>).
    const placeholders = Object.keys(local.mapping).sort((a, b) => b.length - a.length);
    placeholders.forEach((ph, i) => {
      const cut = ph.lastIndexOf("_");
      if (cut < 1) return;
      const prefix = ph.slice(1, cut);
      const value = local.mapping[ph];
      const key = `${prefix}\u0001${value}`;
      let global = byValue.get(key);
      if (!global) {
        const n = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, n);
        global = `<${prefix}_${n}>`;
        byValue.set(key, global);
        mapping[global] = value;
      }
      const temp = `${TEMP_MARK}${i}${TEMP_MARK}`;
      text = text.split(ph).join(temp);
      temps.push([temp, global]);
    });
    for (const [temp, global] of temps) text = text.split(temp).join(global);
    if (text.includes(TEMP_MARK)) return null;
    parts.push(text);
  }
  return { parts, mapping };
}


/**
 * Редактира ЕДНОВРЕМЕННО целия изходящ контекст с ЕДИН общ мапинг.
 * Различни стойности → различни плейсхолдъри; една и съща стойност навсякъде →
 * един и същ плейсхолдър. При `redactionRequired = false` контекстът се връща
 * непроменен с празен мапинг.
 */
export function redactGeneratorContext(
  ctx: GeneratorContext,
  opts: { redactionRequired: boolean },
): RedactedGeneratorContext | GeneratorContextError {
  const fields = collectFields(ctx);
  if (!fields) return notRedactable();

  if (!opts.redactionRequired) {
    return {
      ok: true,
      redactionApplied: false,
      context: { ...ctx, qa: ctx.qa.map((q) => ({ ...q })) },
      mapping: {},
    };
  }

  // Рамкирането е СТРУКТУРНО (масив), а не текстово: няма разделител, който
  // PII шаблон (телефон/адрес) да „прелее" и да развали разделянето. Всяко поле
  // се редактира отделно, но плейсхолдърите се номерират през ЕДИН общ брояч и
  // ЕДИН общ мапинг, така че една и съща стойност навсякъде получава един
  // плейсхолдър, а различните стойности остават различни.
  const framed = redactFieldsWithSharedMapping(fields);
  if (!framed) return notRedactable();
  const { parts, mapping } = framed;
  // Fail-closed проверка на структурата след редакцията.
  if (!Array.isArray(parts) || parts.length !== fields.length) return notRedactable();
  if (!parts.every((p): p is string => typeof p === "string")) return notRedactable();



  let k = 0;
  const next = () => parts[k++];
  const sector = next();
  const contractName = next();
  const documentName = next();
  const partyA = next();
  const partyB = next();
  const arbitrationCourt = next();
  const languageContext = next();
  const qa = ctx.qa.map((q) => ({ id: q.id, label: next(), answer: next() }));

  return {
    ok: true,
    redactionApplied: true,
    context: {
      sector,
      contractName,
      documentName,
      partyA,
      partyB,
      arbitrationCourt,
      languageContext,
      qa,
    },
    mapping,
  };
}

/** Редовете „етикет: отговор" за промпта — вече САНИТИРАНИ. */
export function buildQaLines(ctx: GeneratorContext): string {
  return ctx.qa.map((q) => `- ${q.label}: ${q.answer}`).join("\n");
}

/**
 * Идентичност на кеша. Включва:
 *  - изрична версия на политиката (старите ключове никога не се улучват);
 *  - удостоверения повикващ (кешът не е глобален);
 *  - ТОЧНИЯ потребителски контекст, използван за генерирането — включително
 *    етикетите И реда на въпросите, арбитражния избор и двуезичния режим.
 */
export function buildGeneratorCacheIdentity(input: {
  context: GeneratorContext;
  promptVersion: string;
  docTypeId: string;
  bilingual: boolean;
  arbitrationEnabled: boolean;
  callerKey: string;
}): string {
  return stableStringify({
    policy: GENERATOR_CACHE_POLICY_VERSION,
    v: input.promptVersion,
    docType: input.docTypeId,
    caller: input.callerKey,
    bilingual: input.bilingual,
    arbitration: { enabled: input.arbitrationEnabled, court: input.context.arbitrationCourt },
    sector: input.context.sector,
    contractName: input.context.contractName,
    documentName: input.context.documentName,
    parties: { a: input.context.partyA, b: input.context.partyB },
    language: input.context.languageContext,
    // Масив, НЕ обект: редът на въпросите е част от идентичността.
    qa: input.context.qa.map((q) => [q.id, q.label, q.answer]),
  });
}
