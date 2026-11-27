// Q4b — ПОВЕРИТЕЛЕН типизиран договор за ЯВНОТО намерение на потребителя.
//
// Бизнес инвариант: документ, създаден от Договори.нет, НЕ трябва мълчаливо да
// противоречи на изричните структурирани избори на потребителя. По-късният
// анализ/ревизия трябва да различава три РАЗЛИЧНИ неща:
//   1) ДОКАЗАНО несъответствие с избрана стойност с висока увереност;
//   2) опционална препоръка;
//   3) непопълнен плейсхолдър за лични данни.
//
// Q4a вече доказа „това е точно този наш документ". Ограничението му беше, че
// `context_fingerprint` е еднопосочен върху ЦЕЛИЯ контекст — от него не може да
// се провери ОТДЕЛНА стойност. Q4b затваря това с ЗАТВОРЕН типизиран набор
// твърдения, всяко с ОТДЕЛНО HMAC обвързване (commitment) върху строга канонична
// нормализация. Така сървърът може да провери „сумата 1000 EUR я има в текста",
// без НИКОГА да съхранява или показва самата стойност.
//
// Правила, които не се нарушават:
//   - Модулът е ЧИСТ: без мрежа, без база, без AI.
//   - В манифеста НЕ влизат имена, адреси, телефони, имейли, идентификатори,
//     свободен текст или сурови бизнес стойности — само ЗАТВОРЕНИ метаданни
//     (вид, слот, валута/мерна единица) и еднопосочни commitment-и.
//   - Никакъв обикновен SHA върху стойности с ниска ентропия (сума, дата) —
//     само HMAC с домейново разделен СЪРВЪРЕН ключ. Иначе 1000 EUR се намира с
//     речникова атака за милисекунди.
//   - Двусмислен вход НЕ дава твърдение. Никога не се домисля намерение от
//     свободна проза.
//   - Fail-closed: невалидна схема, чужд/подправен commitment, друга политика →
//     недоверено. За ВЪНШНИ документи това никога не е фатално.

import { sha256Hex } from "./normalize.ts";

export const INTENT_POLICY_VERSION = "q4b-intent-assertions-1" as const;
export const INTENT_SCHEMA_VERSION = 1 as const;

/** Домейнова сепарация — ключът НИКОГА не е самият сървърен секрет. */
const COMMITMENT_KEY_DOMAIN = "dogovori.net/q4b-intent-commitment/v1";

/** Строги горни граници — манифестът не може да се надуе от вход. */
export const MAX_INTENT_ASSERTIONS = 24;

const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Затворени видове и слотове
// ---------------------------------------------------------------------------

export const INTENT_KINDS = ["money", "duration", "date", "party_role", "flag"] as const;
export type IntentKind = typeof INTENT_KINDS[number];

/**
 * ЗАТВОРЕН списък слотове. Слотът е ТЕХНИЧЕСКО име на роля на стойността в
 * документа — никога потребителски текст.
 */
export const INTENT_SLOTS = [
  "money.price",
  "money.rent",
  "money.penalty",
  "money.deposit",
  "duration.term",
  "duration.notice",
  "duration.payment",
  "date.start",
  "date.end",
  "date.signing",
  "party_role.a",
  "party_role.b",
  "flag.bilingual",
  "flag.arbitration",
] as const;
export type IntentSlot = typeof INTENT_SLOTS[number];

const SLOT_KIND: Record<IntentSlot, IntentKind> = {
  "money.price": "money",
  "money.rent": "money",
  "money.penalty": "money",
  "money.deposit": "money",
  "duration.term": "duration",
  "duration.notice": "duration",
  "duration.payment": "duration",
  "date.start": "date",
  "date.end": "date",
  "date.signing": "date",
  "party_role.a": "party_role",
  "party_role.b": "party_role",
  "flag.bilingual": "flag",
  "flag.arbitration": "flag",
};

/** Човешки етикети за СЛОТА (не за стойността) — влизат в текста на бележката. */
const SLOT_LABEL: Record<IntentSlot, string> = {
  "money.price": "цена/възнаграждение",
  "money.rent": "наемна цена",
  "money.penalty": "неустойка",
  "money.deposit": "депозит/гаранция",
  "duration.term": "срок на договора",
  "duration.notice": "срок на предизвестие",
  "duration.payment": "срок за плащане",
  "date.start": "начална дата",
  "date.end": "крайна дата",
  "date.signing": "дата на подписване",
  "party_role.a": "роля на страна А",
  "party_role.b": "роля на страна Б",
  "flag.bilingual": "двуезичен документ",
  "flag.arbitration": "арбитражна клауза",
};

export const intentSlotLabel = (slot: string): string =>
  (SLOT_LABEL as Record<string, string>)[slot] ?? "заявена стойност";

export const CURRENCIES = ["EUR", "BGN", "USD"] as const;
export type CurrencyCode = typeof CURRENCIES[number];

export const DURATION_UNITS = ["hour", "day", "week", "month", "year"] as const;
export type DurationUnit = typeof DURATION_UNITS[number];

/** Затворен набор роли на страните — само технически slug-ове. */
export const PARTY_ROLES = [
  "buyer",
  "seller",
  "lessor",
  "lessee",
  "contractor",
  "client",
  "employer",
  "employee",
  "agent",
  "lender",
  "borrower",
  "provider",
  "recipient",
  "licensor",
  "licensee",
  "disclosing",
  "receiving",
] as const;
export type PartyRole = typeof PARTY_ROLES[number];

export const INTENT_FLAGS = ["bilingual", "arbitration"] as const;
export type IntentFlagName = typeof INTENT_FLAGS[number];

// ---------------------------------------------------------------------------
// Типизирани стойности и СТРОГА канонична нормализация
// ---------------------------------------------------------------------------

export type IntentValue =
  | { kind: "money"; amount: string; currency: CurrencyCode }
  | { kind: "duration"; count: number; unit: DurationUnit }
  | { kind: "date"; iso: string }
  | { kind: "party_role"; side: "a" | "b"; role: PartyRole }
  | { kind: "flag"; name: IntentFlagName; value: boolean };

/**
 * Нормализация на СУМА. Приема САМО безобидни форматни варианти и връща `null`
 * при двусмислие — никога не гадае.
 *
 * Приема: `1000`, `1 000`, `1000.50`, `1000,50`, `1 000,50`, `1,000.50`,
 *         `1.000,50`, `1000.00` (→ `1000`).
 * Отказва: `1,0000`, `1.2.3`, `1,23,456`, празно, нечислово.
 *
 * КРИТИЧНО: 1000 и 10000 ОСТАВАТ различни; 1000 и 1000.50 остават различни.
 */
export function canonicalAmount(raw: unknown): string | null {
  let s = typeof raw === "number" && Number.isFinite(raw)
    ? String(raw)
    : typeof raw === "string"
      ? raw
      : "";
  s = s.replace(/[\s\u00A0\u2009']/g, "").trim();
  if (!s) return null;
  // Само цифри и до два вида разделители.
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;

  let intPart = "";
  let fracPart = "";

  const splitAt = (sep: "." | ",") => {
    const i = s.lastIndexOf(sep);
    return [s.slice(0, i), s.slice(i + 1)] as const;
  };
  const groupsValid = (t: string, sep: "." | ",") => {
    if (!t.includes(sep)) return /^\d{1,3}$|^\d+$/.test(t);
    const g = t.split(sep);
    if (g.length < 2) return false;
    if (!/^\d{1,3}$/.test(g[0])) return false;
    return g.slice(1).every((x) => /^\d{3}$/.test(x));
  };

  if (dots > 0 && commas > 0) {
    // Последният разделител е десетичният; другият трябва да е групиращ.
    const decSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const grpSep = decSep === "." ? "," : ".";
    const [head, tail] = splitAt(decSep);
    if (!/^\d{1,2}$/.test(tail)) return null;
    if (head.includes(decSep)) return null;
    if (!groupsValid(head, grpSep)) return null;
    intPart = head.split(grpSep).join("");
    fracPart = tail;
  } else if (dots > 0 || commas > 0) {
    const sep: "." | "," = dots > 0 ? "." : ",";
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    if (parts.length === 2 && /^\d{1,2}$/.test(last)) {
      // Десетичен разделител (1000,50 / 1000.5).
      if (!/^\d+$/.test(parts[0])) return null;
      intPart = parts[0];
      fracPart = last;
    } else if (parts.every((p, i) => (i === 0 ? /^\d{1,3}$/.test(p) : /^\d{3}$/.test(p)))) {
      // Групиране на хиляди (1 000 / 1.000.000).
      intPart = parts.join("");
      fracPart = "";
    } else {
      return null;
    }
  } else {
    intPart = s;
  }

  intPart = intPart.replace(/^0+(?=\d)/, "");
  fracPart = fracPart.replace(/0+$/, "");
  if (!/^\d+$/.test(intPart)) return null;
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

const CURRENCY_ALIASES: Array<[RegExp, CurrencyCode]> = [
  [/^(?:eur|евро|€)$/i, "EUR"],
  [/^(?:bgn|лв\.?|лев|лева)$/i, "BGN"],
  [/^(?:usd|\$|долар|долара|долари)$/i, "USD"],
];

export function canonicalCurrency(raw: unknown): CurrencyCode | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  for (const [rx, code] of CURRENCY_ALIASES) if (rx.test(s)) return code;
  return null;
}

const DURATION_ALIASES: Array<[RegExp, DurationUnit]> = [
  [/^(?:час|часа|часове|hour|hours)$/i, "hour"],
  [/^(?:ден|дни|дена|day|days)$/i, "day"],
  [/^(?:седмица|седмици|week|weeks)$/i, "week"],
  [/^(?:месец|месеца|месеци|month|months)$/i, "month"],
  [/^(?:година|години|year|years)$/i, "year"],
];

export function canonicalDurationUnit(raw: unknown): DurationUnit | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  for (const [rx, u] of DURATION_ALIASES) if (rx.test(s)) return u;
  return null;
}

const BG_MONTHS: Record<string, number> = {
  януари: 1,
  февруари: 2,
  март: 3,
  април: 4,
  май: 5,
  юни: 6,
  юли: 7,
  август: 8,
  септември: 9,
  октомври: 10,
  ноември: 11,
  декември: 12,
};

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Нормализация на ДАТА до ISO. Двусмислен формат → `null`. */
export function canonicalDate(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\.?$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})\s*\.?\s*([А-Яа-я]+)\s+(\d{4})\s*(?:г\.?)?$/);
  if (m) {
    const mo = BG_MONTHS[m[2].toLowerCase()];
    const [d, y] = [Number(m[1]), Number(m[3])];
    return mo && isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }
  return null;
}

const PARTY_ROLE_ALIASES: Array<[RegExp, PartyRole]> = [
  [/^(?:buyer|купувач)$/i, "buyer"],
  [/^(?:seller|продавач)$/i, "seller"],
  [/^(?:lessor|наемодател)$/i, "lessor"],
  [/^(?:lessee|tenant|наемател)$/i, "lessee"],
  [/^(?:contractor|изпълнител)$/i, "contractor"],
  [/^(?:client|възложител)$/i, "client"],
  [/^(?:employer|работодател)$/i, "employer"],
  [/^(?:employee|работник|служител)$/i, "employee"],
  [/^(?:agent|довереник|пълномощник|агент)$/i, "agent"],
  [/^(?:lender|заемодател|кредитор)$/i, "lender"],
  [/^(?:borrower|заемател|заемополучател)$/i, "borrower"],
  [/^(?:provider|доставчик)$/i, "provider"],
  [/^(?:recipient|получател)$/i, "recipient"],
  [/^(?:licensor|лицензодател)$/i, "licensor"],
  [/^(?:licensee|лицензополучател)$/i, "licensee"],
  [/^(?:disclosing|разкриваща)$/i, "disclosing"],
  [/^(?:receiving|получаваща)$/i, "receiving"],
];

export function canonicalPartyRole(raw: unknown): PartyRole | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  for (const [rx, r] of PARTY_ROLE_ALIASES) if (rx.test(s)) return r;
  return null;
}

/**
 * Канонична серизация на ТИПИЗИРАНАТА стойност. Точно тази стойност влиза в
 * HMAC-а и НИКОГА не се записва, не се връща и не се логва.
 *
 * Разликите, които ТРЯБВА да останат материални: EUR ≠ BGN, 1000 ≠ 10000,
 * 10 дни ≠ 10 месеца, купувач ≠ продавач, true ≠ false.
 */
export function canonicalIntentValue(value: IntentValue): string | null {
  switch (value?.kind) {
    case "money": {
      const amount = canonicalAmount(value.amount);
      const currency = canonicalCurrency(value.currency);
      return amount && currency ? `money|${amount}|${currency}` : null;
    }
    case "duration": {
      if (!Number.isInteger(value.count) || value.count <= 0 || value.count > 100000) return null;
      const unit = canonicalDurationUnit(value.unit);
      return unit ? `duration|${value.count}|${unit}` : null;
    }
    case "date": {
      const d = canonicalDate(value.iso);
      return d ? `date|${d}` : null;
    }
    case "party_role": {
      const role = canonicalPartyRole(value.role);
      if (!role) return null;
      if (value.side !== "a" && value.side !== "b") return null;
      return `party_role|${value.side}|${role}`;
    }
    case "flag": {
      if (!INTENT_FLAGS.includes(value.name)) return null;
      if (typeof value.value !== "boolean") return null;
      return `flag|${value.name}|${value.value ? "true" : "false"}`;
    }
    default:
      return null;
  }
}

/** Затворените метаданни, които СА безопасни за клиента (без самата стойност). */
function safeMeta(value: IntentValue): string | null {
  switch (value?.kind) {
    case "money":
      return canonicalCurrency(value.currency);
    case "duration":
      return canonicalDurationUnit(value.unit);
    case "flag":
      return value.name;
    case "party_role":
      return value.side;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// HMAC commitment (домейново разделен сървърен ключ)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function deriveCommitmentKey(serverSecret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const material = await crypto.subtle.sign("HMAC", base, enc.encode(COMMITMENT_KEY_DOMAIN));
  return await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Commitment върху (политика, вид, слот, канонична стойност). Слотът влиза в
 * HMAC-а, за да не може твърдение за „неустойка" да се преизползва за „цена".
 */
export async function computeIntentCommitment(input: {
  slot: IntentSlot;
  canonical: string;
  serverSecret: string;
}): Promise<string> {
  if (typeof input.serverSecret !== "string" || input.serverSecret.length < 16) {
    throw new Error("intent_commitment_key_missing");
  }
  const key = await deriveCommitmentKey(input.serverSecret);
  const msg = [INTENT_POLICY_VERSION, INTENT_SCHEMA_VERSION, input.slot, input.canonical].join("|");
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/** Сравнение с постоянно време върху hex низове. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Твърдения
// ---------------------------------------------------------------------------

export interface IntentAssertion {
  kind: IntentKind;
  slot: IntentSlot;
  /** ЗАТВОРЕНИ метаданни (валута/мерна единица/страна/флаг) — никога стойност. */
  meta: string | null;
  /** Изисква ли се доказано присъствие в готовия документ. */
  required: boolean;
  /** Еднопосочен HMAC върху каноничната стойност. */
  commitment: string;
}

export interface IntentDraft {
  slot: IntentSlot;
  value: IntentValue;
  required?: boolean;
}

/** Стабилен ред — за детерминирана серизация и подпис. */
const orderAssertions = (a: IntentAssertion[]): IntentAssertion[] =>
  [...a].sort((x, y) =>
    x.slot === y.slot ? x.commitment.localeCompare(y.commitment) : x.slot.localeCompare(y.slot)
  );

/**
 * Съставя ПОДПИСВАЕМИ твърдения от типизирани чернови. Невалидна/двусмислена
 * стойност се ИЗПУСКА — никога не се гадае. Дублиращите се слотове с различни
 * стойности се изпускат ИЗЦЯЛО (двусмислие).
 */
export async function buildIntentAssertions(input: {
  drafts: readonly IntentDraft[];
  serverSecret: string;
}): Promise<IntentAssertion[]> {
  if (typeof input.serverSecret !== "string" || input.serverSecret.length < 16) {
    throw new Error("intent_commitment_key_missing");
  }
  const bySlot = new Map<IntentSlot, { canonical: string; value: IntentValue; required: boolean } | null>();
  for (const draft of input.drafts ?? []) {
    if (!draft || typeof draft !== "object") continue;
    const slot = draft.slot;
    if (!INTENT_SLOTS.includes(slot)) continue;
    if (SLOT_KIND[slot] !== draft.value?.kind) continue;
    const canonical = canonicalIntentValue(draft.value);
    if (!canonical) continue;
    const prev = bySlot.get(slot);
    if (prev === null) continue;
    if (prev && prev.canonical !== canonical) {
      // Един и същ слот с ДВЕ различни стойности → двусмислено, изпуска се.
      bySlot.set(slot, null);
      continue;
    }
    bySlot.set(slot, { canonical, value: draft.value, required: draft.required !== false });
  }

  const out: IntentAssertion[] = [];
  for (const [slot, entry] of bySlot) {
    if (!entry) continue;
    if (out.length >= MAX_INTENT_ASSERTIONS) break;
    out.push({
      kind: SLOT_KIND[slot],
      slot,
      meta: safeMeta(entry.value),
      required: entry.required,
      commitment: await computeIntentCommitment({
        slot,
        canonical: entry.canonical,
        serverSecret: input.serverSecret,
      }),
    });
  }
  return orderAssertions(out);
}

/** Строга валидация на схемата. Всяко отклонение → `null` (fail-closed). */
export function validateIntentAssertions(value: unknown): IntentAssertion[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_INTENT_ASSERTIONS) return null;
  const out: IntentAssertion[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const slot = o.slot;
    if (typeof slot !== "string" || !INTENT_SLOTS.includes(slot as IntentSlot)) return null;
    const kind = o.kind;
    if (kind !== SLOT_KIND[slot as IntentSlot]) return null;
    if (typeof o.commitment !== "string" || !HEX64.test(o.commitment)) return null;
    if (typeof o.required !== "boolean") return null;
    const meta = o.meta;
    if (meta !== null && (typeof meta !== "string" || meta.length > 16)) return null;
    const key = `${slot}|${o.commitment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: kind as IntentKind,
      slot: slot as IntentSlot,
      meta: typeof meta === "string" ? meta : null,
      required: o.required,
      commitment: o.commitment,
    });
  }
  return orderAssertions(out);
}

/** Канонична серизация — влиза в подписа на манифеста за качество. */
export function canonicalizeIntentAssertions(assertions: readonly IntentAssertion[]): string {
  return orderAssertions([...assertions])
    .map((a) => [a.slot, a.kind, a.meta ?? "", a.required ? "1" : "0", a.commitment].join(":"))
    .join(";");
}

/** Безопасна идентичност за кеша — без стойности, само commitment-и. */
export async function computeIntentIdentity(
  assertions: readonly IntentAssertion[],
): Promise<string> {
  return await sha256Hex([INTENT_POLICY_VERSION, canonicalizeIntentAssertions(assertions)].join("|"));
}

// ---------------------------------------------------------------------------
// Извличане от АВТОРИТЕТНИ структурирани входове (никога от свободна проза)
// ---------------------------------------------------------------------------

/**
 * Правила „етикет/идентификатор на въпрос → слот". Ако етикетът улучи ПОВЕЧЕ от
 * едно правило, входът е двусмислен и НЕ дава твърдение.
 */
const SLOT_RULES: Array<{ slot: IntentSlot; rx: RegExp }> = [
  { slot: "money.rent", rx: /наем(?:на)?\s*(?:цена|вноска|месечн)|месечен\s+наем|\brent\b/i },
  { slot: "money.penalty", rx: /неустойк|penalt/i },
  { slot: "money.deposit", rx: /депозит|гаранционна\s+сума|\bdeposit\b/i },
  { slot: "money.price", rx: /\bцена\b|възнагражден|стойност\s+на\s+договора|\bprice\b|\bfee\b/i },
  { slot: "duration.notice", rx: /предизвест|\bnotice\b/i },
  { slot: "duration.payment", rx: /срок\s+за\s+плащане|payment\s+term/i },
  { slot: "duration.term", rx: /срок(?:ът)?\s+на\s+договора|продължителност|\bterm\b|\bduration\b/i },
  { slot: "date.start", rx: /начална\s+дата|дата\s+на\s+(?:започване|влизане\s+в\s+сила)|start\s+date/i },
  { slot: "date.end", rx: /крайна\s+дата|дата\s+на\s+(?:завършване|приключване)|end\s+date/i },
  { slot: "date.signing", rx: /дата\s+на\s+подписване|signing\s+date/i },
];

/** Разпознава сума+валута в ЕДИН структуриран отговор. */
function parseMoneyAnswer(answer: string): { amount: string; currency: CurrencyCode } | null {
  const m = answer.match(
    /(\d[\d\s.,\u00A0]*)\s*(EUR|BGN|USD|€|\$|евро|лв\.?|лева?|долар[аи]?)/i,
  ) ?? answer.match(/(EUR|BGN|USD|€|\$|евро|лв\.?|лева?)\s*(\d[\d\s.,\u00A0]*)/i);
  if (!m) return null;
  const a = canonicalAmount(/^\d/.test(m[1]) ? m[1] : m[2]);
  const c = canonicalCurrency(/^\d/.test(m[1]) ? m[2] : m[1]);
  return a && c ? { amount: a, currency: c } : null;
}

function parseDurationAnswer(answer: string): { count: number; unit: DurationUnit } | null {
  const m = answer.match(
    /(\d{1,5})\s*(час(?:а|ове)?|дни|дена|ден|седмиц(?:а|и)|месец(?:а|и)?|годин(?:а|и)|hours?|days?|weeks?|months?|years?)/i,
  );
  if (!m) return null;
  const unit = canonicalDurationUnit(m[2]);
  const count = Number(m[1]);
  return unit && Number.isInteger(count) && count > 0 ? { count, unit } : null;
}

export interface IntentExtractionInput {
  /** Въпросите на съветника — АВТОРИТЕТЕН структуриран вход. */
  questions?: unknown;
  answers?: unknown;
  /** Изрично избрани роли на страните (само ако потокът реално ги подава). */
  roles?: { a?: unknown; b?: unknown } | null;
  /** Затворени булеви флагове, реално дадени от потока. */
  flags?: { bilingual?: unknown; arbitration?: unknown } | null;
  /**
   * АВТОРИТЕТНИ НАИМЕНОВАНИ полета със свободен текст. Слотът е известен от
   * името на полето, затова се допуска САМО извличане с висока увереност:
   * точно ЕДИН недвусмислен кандидат. Нула или няколко → нищо.
   */
  structured?: { term?: unknown; prices?: unknown } | null;
}

/**
 * Точно ЕДНА недвусмислена сума в прозата на ИЗВЕСТНО поле. При нула или няколко
 * различни кандидата връща `null` — намерение не се домисля.
 */
export function soleMoneyFromKnownField(
  raw: unknown,
): { amount: string; currency: CurrencyCode } | null {
  const s = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  if (!s.trim()) return null;
  const found = moneyValues(normalizeDoc(s));
  if (found.length !== 1) return null;
  const parts = found[0].split("|");
  const amount = parts[1];
  const currency = canonicalCurrency(parts[2]);
  return amount && currency ? { amount, currency } : null;
}

/** Точно ЕДНА недвусмислена продължителност в прозата на ИЗВЕСТНО поле. */
export function soleDurationFromKnownField(
  raw: unknown,
): { count: number; unit: DurationUnit } | null {
  const s = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  if (!s.trim()) return null;
  const found = durationValues(normalizeDoc(s));
  if (found.length !== 1) return null;
  const parts = found[0].split("|");
  const count = Number(parts[1]);
  const unit = canonicalDurationUnit(parts[2]);
  return unit && Number.isInteger(count) && count > 0 ? { count, unit } : null;
}

/**
 * Извлича ЧЕРНОВИ твърдения САМО от недвусмислени структурирани полета.
 * Свободна проза, двусмислени етикети и неразпознати формати се ИЗПУСКАТ.
 */
export function extractIntentDrafts(input: IntentExtractionInput): IntentDraft[] {
  const drafts: IntentDraft[] = [];
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const answers = input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)
    ? (input.answers as Record<string, unknown>)
    : {};

  for (const raw of questions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const q = raw as Record<string, unknown>;
    if (typeof q.id !== "string") continue;
    const answerRaw = answers[q.id];
    const answer = typeof answerRaw === "string"
      ? answerRaw
      : typeof answerRaw === "number"
        ? String(answerRaw)
        : "";
    if (!answer.trim()) continue;
    const probe = `${q.id} ${typeof q.label === "string" ? q.label : ""}`;

    const hits = SLOT_RULES.filter((r) => r.rx.test(probe));
    if (hits.length !== 1) continue; // двусмислено или без правило → нищо
    const slot = hits[0].slot;

    switch (SLOT_KIND[slot]) {
      case "money": {
        const m = parseMoneyAnswer(answer);
        if (m) drafts.push({ slot, value: { kind: "money", ...m } });
        break;
      }
      case "duration": {
        const d = parseDurationAnswer(answer);
        if (d) drafts.push({ slot, value: { kind: "duration", ...d } });
        break;
      }
      case "date": {
        const iso = canonicalDate(answer.trim());
        if (iso) drafts.push({ slot, value: { kind: "date", iso } });
        break;
      }
      default:
        break;
    }
  }

  // Q4b(4) — АВТОРИТЕТНИ наименовани полета: слотът е известен от името на
  // полето, затова се допуска извличане само при ТОЧНО ЕДИН кандидат.
  const soleTerm = soleDurationFromKnownField(input.structured?.term);
  if (soleTerm) drafts.push({ slot: "duration.term", value: { kind: "duration", ...soleTerm } });
  const solePrice = soleMoneyFromKnownField(input.structured?.prices);
  if (solePrice) drafts.push({ slot: "money.price", value: { kind: "money", ...solePrice } });

  const roleA = canonicalPartyRole(input.roles?.a);
  const roleB = canonicalPartyRole(input.roles?.b);
  if (roleA && roleB && roleA !== roleB) {
    drafts.push({ slot: "party_role.a", value: { kind: "party_role", side: "a", role: roleA } });
    drafts.push({ slot: "party_role.b", value: { kind: "party_role", side: "b", role: roleB } });
  }

  // Q4b(2) — твърдение се създава САМО за ИЗРИЧЕН избор TRUE и то е ИЗИСКВАНО.
  // Отсъствието на флаг не може да се докаже безопасно от текста, затова `false`
  // НЕ поражда твърдение (иначе бихме издавали недоказуеми несъответствия).
  if (input.flags?.bilingual === true) {
    drafts.push({
      slot: "flag.bilingual",
      value: { kind: "flag", name: "bilingual", value: true },
      required: true,
    });
  }
  if (input.flags?.arbitration === true) {
    drafts.push({
      slot: "flag.arbitration",
      value: { kind: "flag", name: "arbitration", value: true },
      required: true,
    });
  }
  return drafts;
}


// ---------------------------------------------------------------------------
// Детерминирана проверка срещу ТЕКУЩИЯ документ
// ---------------------------------------------------------------------------

const normalizeDoc = (text: string): string =>
  (text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t\u00A0]+/g, " ");

/** Всички суми, намерени в текста, като канонични стойности. */
function moneyValues(text: string): string[] {
  const out = new Set<string>();
  const rx =
    /(\d[\d\s.,\u00A0]*\d|\d)\s*(EUR|BGN|USD|€|\$|евро|лв\.?|лева|лев|долар[аи]?)|(EUR|BGN|USD|€|\$|евро|лв\.?|лева|лев)\s*(\d[\d\s.,\u00A0]*\d|\d)/gi;
  for (const m of text.matchAll(rx)) {
    const rawAmount = m[1] ?? m[4];
    const rawCur = m[2] ?? m[3];
    const amount = canonicalAmount(rawAmount);
    const currency = canonicalCurrency(rawCur);
    if (amount && currency) out.add(`money|${amount}|${currency}`);
  }
  return [...out];
}

function durationValues(text: string): string[] {
  const out = new Set<string>();
  const rx =
    /(\d{1,5})\s*(?:\([^)]{0,40}\)\s*)?(час(?:а|ове)?|дни|дена|ден|седмиц(?:а|и)|месец(?:а|и)?|годин(?:а|и)|hours?|days?|weeks?|months?|years?)/gi;
  for (const m of text.matchAll(rx)) {
    const unit = canonicalDurationUnit(m[2]);
    const count = Number(m[1]);
    if (unit && Number.isInteger(count) && count > 0) out.add(`duration|${count}|${unit}`);
  }
  return [...out];
}

function dateValues(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const d = canonicalDate(`${m[1]}-${m[2]}-${m[3]}`);
    if (d) out.add(`date|${d}`);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/g)) {
    const d = canonicalDate(`${m[1]}.${m[2]}.${m[3]}`);
    if (d) out.add(`date|${d}`);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s*\.?\s*([А-Яа-я]+)\s+(\d{4})\b/g)) {
    const d = canonicalDate(`${m[1]} ${m[2]} ${m[3]}`);
    if (d) out.add(`date|${d}`);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Q4b(1) — СЛОТОВО ОБВЪРЗВАНЕ на кандидатите
//
// Глобалните множества по ВИД не доказват нищо за слота: ако очакваната
// `money.price = 1000 EUR` липсва, но в текста има `неустойка 1000 EUR`,
// commitment-ите съвпадат и твърдението „минава" погрешно. Затова кандидатите
// се търсят САМО в прозорец около ЗАТВОРЕН лексикален котвен израз за ТОЧНО
// ТОЗИ слот. Стойност от друг слот НИКОГА не удовлетворява твърдението, дори да
// е идентична. Липса на закотвена стойност за изискван слот = несъответствие;
// двусмислие не се гадае.
// ---------------------------------------------------------------------------

/** Затворени котвени изрази (BG + EN) за всеки слот със стойност в текста. */
const SLOT_ANCHOR_ALTS: Partial<Record<IntentSlot, string[]>> = {
  "money.price": [
    "цена",
    "цената",
    "цени",
    "продажна цена",
    "продажната цена",
    "възнаграждение",
    "възнаграждението",
    "стойност на договора",
    "стойността на договора",
    "обща стойност",
    "общата стойност",
    "price",
    "purchase price",
    "contract price",
    "total price",
    "fee",
    "fees",
    "remuneration",
  ],
  "money.rent": [
    "наем",
    "наема",
    "наемът",
    "наемна цена",
    "наемната цена",
    "месечен наем",
    "месечният наем",
    "наемна вноска",
    "наемната вноска",
    "rent",
    "monthly rent",
    "rental price",
  ],
  "money.penalty": [
    "неустойка",
    "неустойката",
    "неустойки",
    "неустойките",
    "penalty",
    "penalties",
    "liquidated damages",
  ],
  "money.deposit": [
    "депозит",
    "депозита",
    "депозитът",
    "гаранционна сума",
    "гаранционната сума",
    "гаранция",
    "deposit",
    "security deposit",
  ],
  "duration.term": [
    "срок на договора",
    "срокът на договора",
    "срок на настоящия договор",
    "срокът на настоящия договор",
    "срок на действие",
    "срокът на действие",
    "продължителност",
    "продължителността",
    "term of the contract",
    "term of the agreement",
    "contract term",
    "duration",
  ],
  "duration.notice": [
    "предизвестие",
    "предизвестието",
    "срок на предизвестие",
    "срокът на предизвестие",
    "notice",
    "notice period",
  ],
  "duration.payment": [
    "срок за плащане",
    "срокът за плащане",
    "срок на плащане",
    "срокове за плащане",
    "payment term",
    "payment terms",
    "payment period",
    "payment deadline",
  ],
  "date.start": [
    "начална дата",
    "началната дата",
    "дата на започване",
    "датата на започване",
    "дата на влизане в сила",
    "влиза в сила",
    "влиза в сила от",
    "start date",
    "commencement date",
    "effective date",
  ],
  "date.end": [
    "крайна дата",
    "крайната дата",
    "дата на завършване",
    "дата на приключване",
    "дата на изтичане",
    "end date",
    "expiry date",
    "expiration date",
    "termination date",
  ],
  "date.signing": [
    "дата на подписване",
    "датата на подписване",
    "подписан на",
    "подписан в",
    "сключен на",
    "сключен в",
    "signing date",
    "date of signing",
    "signed on",
    "executed on",
  ],
};

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Границата се пази ръчно — `\b` не работи за кирилица. */
const anchorRegexFor = (slot: IntentSlot): RegExp | null => {
  const alts = SLOT_ANCHOR_ALTS[slot];
  if (!alts || alts.length === 0) return null;
  const body = [...alts]
    .sort((a, b) => b.length - a.length)
    .map((a) => escapeRx(a).replace(/\s+/g, "\\s+"))
    .join("|");
  return new RegExp(`(?<![А-Яа-яA-Za-z])(?:${body})(?![А-Яа-яA-Za-z])`, "gi");
};

const ANCHOR_RX_CACHE = new Map<IntentSlot, RegExp | null>();
const anchorRegexCached = (slot: IntentSlot): RegExp | null => {
  if (!ANCHOR_RX_CACHE.has(slot)) ANCHOR_RX_CACHE.set(slot, anchorRegexFor(slot));
  return ANCHOR_RX_CACHE.get(slot) ?? null;
};

interface AnchorHit {
  slot: IntentSlot;
  start: number;
  end: number;
}

/**
 * Всички котви за даден ВИД, с разрешаване на застъпвания: по-дългият (по-
 * специфичният) израз печели („наемна цена" > „цена"); при РАВНА дължина и
 * различен слот застъпването е двусмислено и ОТПАДА изцяло.
 */
function anchorHits(text: string, kind: IntentKind): AnchorHit[] {
  const raw: AnchorHit[] = [];
  for (const slot of INTENT_SLOTS) {
    if (SLOT_KIND[slot] !== kind) continue;
    const rx = anchorRegexCached(slot);
    if (!rx) continue;
    for (const m of text.matchAll(rx)) {
      const start = m.index ?? 0;
      raw.push({ slot, start, end: start + m[0].length });
    }
  }
  raw.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept: AnchorHit[] = [];
  for (const hit of raw) {
    const idx = kept.findIndex((k) => hit.start < k.end && k.start < hit.end);
    if (idx < 0) {
      kept.push(hit);
      continue;
    }
    const other = kept[idx];
    if (other.slot === hit.slot) continue;
    const lenOther = other.end - other.start;
    const lenHit = hit.end - hit.start;
    if (lenHit > lenOther) {
      kept.splice(idx, 1, hit);
    } else if (lenHit === lenOther) {
      kept.splice(idx, 1); // двусмислено → и двете отпадат
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Прозорец след котвата — покрива и „заглавие + следващо тяло". */
const ANCHOR_WINDOW = 260;

function slotWindows(text: string, slot: IntentSlot): string[] {
  const hits = anchorHits(text, SLOT_KIND[slot]);
  const out: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].slot !== slot) continue;
    let limit = Math.min(text.length, hits[i].end + ANCHOR_WINDOW);
    for (let j = i + 1; j < hits.length; j++) {
      if (hits[j].slot !== slot) {
        // Прозорецът НЕ преминава в чужд слот — иначе „Цена ... Неустойка 1000"
        // би удовлетворило цената.
        limit = Math.min(limit, hits[j].start);
        break;
      }
    }
    if (limit > hits[i].end) out.push(text.slice(hits[i].end, limit));
  }
  return out;
}

/** Кандидати САМО от закотвените за слота прозорци. */
function anchoredCandidates(text: string, slot: IntentSlot): string[] {
  const kind = SLOT_KIND[slot];
  const extract = kind === "money" ? moneyValues : kind === "duration" ? durationValues : dateValues;
  const out = new Set<string>();
  for (const window of slotWindows(text, slot)) {
    for (const v of extract(window)) out.add(v);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Q4b(2) — НАБЛЮДАЕМИ структурни факти (от РЕЗУЛТАТА, не от входа)
// ---------------------------------------------------------------------------

const trimmed = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Двуезичността се извежда от РЕАЛНАТА структура на готовия договор
 * (title/preamble/clauses[].title/clauses[].body/closing + `_en` двойките им).
 * Всеки непразен български сегмент ТРЯБВА да има непразен английски аналог.
 * Само зададено `bilingual: true` НЕ е доказателство за превод.
 * `null` = структурата не позволява извод (непроверимо).
 */
export function detectBilingualStructure(contract: unknown): boolean | null {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return null;
  const c = contract as Record<string, unknown>;
  const clauses = Array.isArray(c.clauses) ? c.clauses : null;

  // BG сегмент → EN аналог (двойки в реда на рендиране).
  const pairs: Array<[string, string]> = [
    [trimmed(c.title), trimmed(c.title_en)],
    [trimmed(c.preamble), trimmed(c.preamble_en)],
  ];
  let recognizable = pairs.some(([bg]) => !!bg);

  for (const raw of clauses ?? []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const cl = raw as Record<string, unknown>;
    // Реалната схема е `body`/`body_en`; `text`/`text_en` са наследени варианти.
    const bgBody = trimmed(cl.body) || trimmed(cl.text);
    const enBody = trimmed(cl.body_en) || trimmed(cl.text_en);
    const bgTitle = trimmed(cl.title);
    const enTitle = trimmed(cl.title_en);
    if (bgBody || bgTitle) recognizable = true;
    pairs.push([bgTitle, enTitle], [bgBody, enBody]);
  }

  pairs.push([trimmed(c.closing), trimmed(c.closing_en)]);
  if (trimmed(c.closing)) recognizable = true;
  if (!recognizable) return null;

  let bgSegments = 0;
  let enSegments = 0;
  for (const [bg, en] of pairs) {
    if (!bg) continue;
    bgSegments++;
    if (!en) return false; // непреведен непразен български сегмент
    enSegments++;
  }
  if (bgSegments === 0) return null;
  return enSegments > 0;
}

/** Строга котва за арбитраж (BG + EN). */
const ARBITRATION_RX =
  /(?<![А-Яа-яA-Za-z])(?:арбитраж[А-Яа-я]*|arbitration|arbitral|arbitrator)(?![А-Яа-яA-Za-z])/i;

/** Отрицание/изключване на арбитраж в изречението. */
const ARBITRATION_NEGATIVE_RX = [
  /без\s+арбитраж/i,
  /(?:не|няма\s+да)\s+(?:[^.;\n]{0,40}?)?(?:чрез|на|от|по|с)\s+арбитраж/i,
  /не\s+подлежат?\s+на\s+арбитраж/i,
  /(?:не|няма\s+да)\s+се\s+реша[^.;\n]{0,40}арбитраж/i,
  /no\s+arbitration/i,
  /not\s+subject\s+to\s+arbitration/i,
  /(?:shall|will|are|is)\s+not\s+[^.;\n]{0,60}arbitration/i,
  /without\s+arbitration/i,
];

/** Оперативно (действащо) арбитражно уреждане на спорове. */
const ARBITRATION_OPERATIVE_RX = [
  /(?:спор|разногласи|претенци)[А-Яа-я]*[^.;\n]{0,120}(?:реша|отнас|разглежд|подлежат|предостав|отправ)[А-Яа-я]*[^.;\n]{0,80}арбитраж/i,
  /арбитраж[А-Яа-я]*[^.;\n]{0,120}(?:реша|разглежд|разгледа)[А-Яа-я]*[^.;\n]{0,80}(?:спор|разногласи|претенци)/i,
  /(?:реша|отнас|разглежд|подлежат)[А-Яа-я]*[^.;\n]{0,60}(?:чрез|от|пред|на)\s+арбитраж/i,
  /(?:dispute|controvers|claim)[a-z]*[^.;\n]{0,120}(?:settl|resolv|refer|submit|determin)[a-z]*[^.;\n]{0,80}arbitrat/i,
  /(?:settl|resolv|refer|submit|determin)[a-z]*[^.;\n]{0,60}(?:by|to|through)\s+(?:binding\s+)?arbitrat/i,
];

/**
 * Арбитражът се извежда от РЕАЛНИЯ текст на документа, а НЕ от избора на входа.
 * `true` = ясна оперативна арбитражна уговорка; `false` = ясно отрицание или
 * пълна липса на арбитраж; `null` = само бегло споменаване/заглавие/твърде
 * кратък текст (непроверимо — никога не се предполага положително).
 */
export function detectArbitrationInText(text: unknown): boolean | null {
  const s = typeof text === "string" ? text : "";
  if (s.trim().length < 120) return null;
  if (!ARBITRATION_RX.test(s)) return false;

  const sentences = s.split(/[.;!?\n]+/).map((x) => x.trim()).filter(Boolean);
  let negated = false;
  let operative = false;
  for (const sentence of sentences) {
    if (!ARBITRATION_RX.test(sentence)) continue;
    if (ARBITRATION_NEGATIVE_RX.some((rx) => rx.test(sentence))) negated = true;
    else if (ARBITRATION_OPERATIVE_RX.some((rx) => rx.test(sentence))) operative = true;
  }
  if (negated) return false;
  if (operative) return true;
  return null; // само споменаване → непроверимо
}


/** Ролеви думи в текста — за да е ДЕТЕРМИНИРАНА посоката (страна А / страна Б). */
const ROLE_IN_TEXT: Array<[PartyRole, RegExp]> = [
  ["buyer", /купувач/i],
  ["seller", /продавач/i],
  ["lessor", /наемодател/i],
  ["lessee", /наемател/i],
  ["contractor", /изпълнител/i],
  ["client", /възложител/i],
  ["employer", /работодател/i],
  ["employee", /работник|служител/i],
  ["agent", /довереник|пълномощник|агент/i],
  ["lender", /заемодател|кредитор/i],
  ["borrower", /заемател|заемополучател|длъжник/i],
  ["provider", /доставчик/i],
  ["recipient", /получател(?!на)/i],
  ["licensor", /лицензодател/i],
  ["licensee", /лицензополучател/i],
  ["disclosing", /разкриваща\s+страна/i],
  ["receiving", /получаваща\s+страна/i],
];

/**
 * Посоката се определя ДЕТЕРМИНИРАНО от реда на първите ДВЕ РАЗЛИЧНИ роли в
 * текста: първата е страна А, втората е страна Б. Така „купувач" и „продавач"
 * НЕ са взаимозаменяеми.
 */
function partyRoleCandidates(text: string): string[] {
  const found: Array<{ role: PartyRole; at: number }> = [];
  for (const [role, rx] of ROLE_IN_TEXT) {
    const m = rx.exec(text);
    if (m) found.push({ role, at: m.index ?? 0 });
  }
  found.sort((a, b) => a.at - b.at);
  const out: string[] = [];
  if (found[0]) out.push(`party_role|a|${found[0].role}`);
  if (found[1]) out.push(`party_role|b|${found[1].role}`);
  return out;
}

export type IntentCheckStatus = "satisfied" | "mismatch" | "unverifiable";

export interface IntentVerification {
  slot: IntentSlot;
  kind: IntentKind;
  meta: string | null;
  required: boolean;
  status: IntentCheckStatus;
}

export interface IntentVerificationReport {
  policy_version: typeof INTENT_POLICY_VERSION;
  checked: number;
  satisfied: number;
  /** ДОКАЗАНИ несъответствия на ИЗИСКВАНИ твърдения. */
  mismatched_required: IntentVerification[];
  results: IntentVerification[];
}

export const EMPTY_INTENT_REPORT: IntentVerificationReport = {
  policy_version: INTENT_POLICY_VERSION,
  checked: 0,
  satisfied: 0,
  mismatched_required: [],
  results: [],
};

/**
 * Проверява всяко твърдение срещу ПЪЛНИЯ рендериран текст (BG + EN).
 * Сравнението е върху HMAC commitment-и: очакваната стойност НИКОГА не е налична
 * в явен вид и не може да бъде показана или обърната.
 *
 * Q4b(1): кандидатите за суми/срокове/дати са СЛОТОВО ОБВЪРЗАНИ — търсят се само
 * в прозорец около затворена котва за ТОЧНО ТОЗИ слот. Идентична стойност в друг
 * слот НЕ удовлетворява твърдението.
 * Q4b(2): флаговете се проверяват срещу НАБЛЮДАЕМ факт от резултата; когато
 * фактът не може да се изведе, статусът е `unverifiable`, никога „satisfied".
 */
export async function verifyIntentAssertions(input: {
  assertions: readonly IntentAssertion[];
  documentText: string;
  serverSecret: string | null;
  /**
   * НАБЛЮДАВАНИ структурни факти, изведени от РЕЗУЛТАТА (не от входа).
   * Липсващ/`undefined` флаг → непроверим, не „удовлетворен".
   */
  structuralFlags?: { bilingual?: boolean; arbitration?: boolean } | null;
}): Promise<IntentVerificationReport> {
  const assertions = Array.isArray(input.assertions) ? input.assertions : [];
  const secret = input.serverSecret;
  if (assertions.length === 0 || typeof secret !== "string" || secret.length < 16) {
    return { ...EMPTY_INTENT_REPORT, results: [] };
  }
  const text = normalizeDoc(input.documentText ?? "");

  const cache = new Map<IntentSlot, string[]>();
  const candidatesFor = (slot: IntentSlot): string[] => {
    const hit = cache.get(slot);
    if (hit) return hit;
    const kind = SLOT_KIND[slot];
    let list: string[] = [];
    if (kind === "money" || kind === "duration" || kind === "date") {
      list = anchoredCandidates(text, slot);
    } else if (kind === "party_role") {
      list = partyRoleCandidates(text);
    } else if (kind === "flag") {
      const f = input.structuralFlags;
      const name: IntentFlagName = slot === "flag.bilingual" ? "bilingual" : "arbitration";
      const fact = f && typeof f === "object" ? f[name] : undefined;
      if (typeof fact === "boolean") list = [`flag|${name}|${fact}`];
    }
    cache.set(slot, list);
    return list;
  };

  const results: IntentVerification[] = [];
  for (const a of assertions) {
    const base: Omit<IntentVerification, "status"> = {
      slot: a.slot,
      kind: a.kind,
      meta: a.meta,
      required: a.required,
    };
    const candidates = candidatesFor(a.slot);
    if (candidates.length === 0) {
      // Флаг без наблюдаем факт → непроверим. Стойност без ЗАКОТВЕН кандидат за
      // точно този слот → ДОКАЗАНА липса (несъответствие), не догадка.
      results.push({ ...base, status: a.kind === "flag" ? "unverifiable" : "mismatch" });
      continue;
    }
    let satisfied = false;
    for (const canonical of candidates) {
      const commitment = await computeIntentCommitment({
        slot: a.slot,
        canonical,
        serverSecret: secret,
      });
      if (constantTimeEqualHex(commitment, a.commitment)) {
        satisfied = true;
        break;
      }
    }
    results.push({ ...base, status: satisfied ? "satisfied" : "mismatch" });
  }


  return {
    policy_version: INTENT_POLICY_VERSION,
    checked: results.length,
    satisfied: results.filter((r) => r.status === "satisfied").length,
    mismatched_required: results.filter((r) => r.required && r.status === "mismatch"),
    results,
  };
}

// ---------------------------------------------------------------------------
// Детерминирани находки (никога не разкриват очакваната стойност)
// ---------------------------------------------------------------------------

export interface IntentIssue {
  severity: "high";
  title: string;
  detail: string;
  /** Маркер, по който по-късните филтри РАЗПОЗНАВАТ детерминирана находка. */
  deterministic: true;
  slot: IntentSlot;
}

/**
 * Превръща ДОКАЗАНИТЕ несъответствия в детерминирани бележки с висока тежест.
 * Текстът съобщава КОЙ слот не съвпада, но НИКОГА самата очаквана стойност —
 * commitment-ът е еднопосочен и не се показва.
 */
export function intentMismatchIssues(report: IntentVerificationReport): IntentIssue[] {
  return (report?.mismatched_required ?? []).map((r) => ({
    severity: "high" as const,
    title: `Несъответствие със заявеното: ${intentSlotLabel(r.slot)}`,
    detail:
      `Стойността, която сте избрали за „${intentSlotLabel(r.slot)}“, не е намерена в текста на ` +
      `документа. Проверете и коригирайте тази стойност, преди да използвате документа.`,
    deterministic: true as const,
    slot: r.slot,
  }));
}

/** Същите находки във формата на проверка (check) за ревизията. */
export function intentMismatchChecks(
  report: IntentVerificationReport,
): Array<{ id: string; label: string; status: "fail"; note: string }> {
  return (report?.mismatched_required ?? []).map((r) => ({
    id: `intent_${r.slot.replace(/\./g, "_")}`,
    label: `Съответствие със заявеното: ${intentSlotLabel(r.slot)}`,
    status: "fail" as const,
    note:
      `Избраната от Вас стойност за „${intentSlotLabel(r.slot)}“ не присъства в документа. ` +
      `Това е автоматична детерминирана проверка, не преценка на модела.`,
  }));
}

export const hasIntentMismatch = (report: IntentVerificationReport | null | undefined): boolean =>
  !!report && report.mismatched_required.length > 0;
