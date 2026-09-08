/**
 * Q2f — контролирано редактиране на ЕДИН низов елемент от запазен документ.
 *
 * Принципи:
 *  - Моделът не е източник на истина. Той подава само семантична цел (enum),
 *    незадължителен индекс, нов текст и кратка причина. Всичко останало —
 *    документ, потребител, разговор, версия, текст ПРЕДИ промяната — се чете от
 *    авторитетния ред през RLS-обхванат клиент.
 *  - Създаването на предложение НЕ променя документа. Прилагането става само
 *    след изрично действие на потребителя, през атомарната SQL функция.
 *  - Тук не се логват текстове на документи или предложения.
 */
import { computeContextVersion } from "./assistant-context-version.ts";

export const EDIT_TARGETS = [
  "title",
  "intro",
  "closing",
  "text",
  "section_heading",
  "section_body",
  "clause_title",
  "clause_body",
] as const;

export type EditTarget = typeof EDIT_TARGETS[number];

export const REPLACEMENT_MAX = 8000;
export const REASON_MAX = 300;
export const MAX_INDEX = 199;

/** Незапълнен placeholder от редакцията на PII (`<NAME_1>`, `<EGN_2>`, …). */
export const REDACTION_TOKEN_RE =
  /<(EMAIL|IBAN|ID_CARD|EGN|PHONE|ADDRESS|NAME)_\d+>/;

export type EditProposalFailureCode =
  | "edit_not_available"
  | "invalid_target"
  | "invalid_index"
  | "target_not_found"
  | "replacement_invalid"
  | "replacement_too_long"
  | "unresolved_redaction"
  | "identical_text"
  | "document_not_found"
  | "stale_context"
  | "persist_failed";

export interface EditTargetArgs {
  target: unknown;
  index?: unknown;
  replacement: unknown;
  reason?: unknown;
}

export type Fail = { ok: false; code: EditProposalFailureCode };

function fail(code: EditProposalFailureCode): Fail {
  return { ok: false, code };
}

export function isEditTarget(value: unknown): value is EditTarget {
  return typeof value === "string" && (EDIT_TARGETS as readonly string[]).includes(value);
}

const INDEXED_TARGETS: Record<string, { collection: "sections" | "clauses"; leaf: string }> = {
  section_heading: { collection: "sections", leaf: "heading" },
  section_body: { collection: "sections", leaf: "body" },
  clause_title: { collection: "clauses", leaf: "title" },
  clause_body: { collection: "clauses", leaf: "body" },
};

/** Канонична текстова форма на пътя (същата, която приема SQL ограничението). */
export function buildTargetPath(
  target: unknown,
  index?: unknown,
): { ok: true; path: string } | Fail {
  if (!isEditTarget(target)) return fail("invalid_target");
  if (target === "title") return { ok: true, path: "title" };
  if (target === "intro" || target === "closing" || target === "text") {
    return { ok: true, path: `payload.${target}` };
  }
  const spec = INDEXED_TARGETS[target];
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > MAX_INDEX
  ) {
    return fail("invalid_index");
  }
  return { ok: true, path: `payload.${spec.collection}[${index}].${spec.leaf}` };
}

export interface AuthoritativeDocumentRow {
  id: string;
  kind?: unknown;
  title?: unknown;
  payload?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * Текстът ПРЕДИ промяната се взема ЕДИНСТВЕНО от авторитетния ред. Изисква се
 * съществуващ низов лист — не се създават нови полета или елементи.
 */
export function resolveTargetLeaf(
  row: AuthoritativeDocumentRow,
  target: EditTarget,
  index?: number,
): { ok: true; before: string } | Fail {
  if (target === "title") {
    return typeof row.title === "string" && row.title.length > 0
      ? { ok: true, before: row.title }
      : fail("target_not_found");
  }
  const payload = row.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return fail("target_not_found");
  }
  const p = payload as Record<string, unknown>;
  if (target === "intro" || target === "closing" || target === "text") {
    const v = p[target];
    return typeof v === "string" && v.length > 0
      ? { ok: true, before: v }
      : fail("target_not_found");
  }
  const spec = INDEXED_TARGETS[target];
  const list = p[spec.collection];
  if (!Array.isArray(list)) return fail("target_not_found");
  if (typeof index !== "number" || index < 0 || index >= list.length) {
    return fail("invalid_index");
  }
  const item = list[index];
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return fail("target_not_found");
  }
  const v = (item as Record<string, unknown>)[spec.leaf];
  return typeof v === "string" && v.length > 0
    ? { ok: true, before: v }
    : fail("target_not_found");
}

/** Кратка, ограничена причина; никога не се доверяваме на дължината от модела. */
export function boundedReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REASON_MAX);
}

/**
 * Причината минава през СЪЩАТА обработка като новия текст: редактираните PII
 * стойности се възстановяват и остатъчен защитен маркер е отказ (иначе в базата
 * би попаднал `<NAME_1>`). Ограничението за дължина се запазва.
 */
export function sanitizeReason(
  raw: unknown,
  restore: (text: string) => string,
): { ok: true; text: string | null } | Fail {
  if (typeof raw !== "string") return { ok: true, text: null };
  const restored = restore(raw);
  if (REDACTION_TOKEN_RE.test(restored)) return fail("unresolved_redaction");
  return { ok: true, text: boundedReason(restored) };
}

/**
 * Нормализира предложения текст: възстановява редактираните PII стойности през
 * мапинга в паметта и отказва, ако е останал неразрешен маркер.
 */
export function sanitizeReplacement(
  raw: unknown,
  restore: (text: string) => string,
): { ok: true; text: string } | Fail {
  if (typeof raw !== "string") return fail("replacement_invalid");
  const restored = restore(raw).replace(/\r\n/g, "\n").trim();
  if (!restored) return fail("replacement_invalid");
  if (restored.length > REPLACEMENT_MAX) return fail("replacement_too_long");
  if (REDACTION_TOKEN_RE.test(restored)) return fail("unresolved_redaction");
  return { ok: true, text: restored };
}

export interface ProposalRecord {
  id: string;
  status: "pending" | "accepted" | "rejected" | "reverted";
  target_path: string;
  before_text: string;
  after_text: string;
  reason: string | null;
  saved_document_id: string;
  thread_id: string;
  created_at?: string | null;
}

export interface ProposeDeps {
  /** RLS-обхванат клиент на извикващия — доказва достъпа до документа. */
  reader: { from: (table: string) => any };
  /** Сървърен клиент за запис в таблицата без клиентски политики. */
  writer: { from: (table: string) => any };
  userId: string;
  threadId: string;
  documentId: string;
  /** Версията на контекста, с която разговорът е обвързан в момента. */
  contextVersion: string;
  /** Пълният контекст НЕ е отрязан — иначе инструментът не е достъпен. */
  contextTruncated: boolean;
  /** Възстановяване на редактираните PII стойности (мапинг в паметта). */
  restore: (text: string) => string;
}

export type ProposeResult = { ok: true; proposal: ProposalRecord } | Fail;

export async function proposeSavedDocumentEdit(
  deps: ProposeDeps,
  args: EditTargetArgs,
): Promise<ProposeResult> {
  if (deps.contextTruncated) return fail("edit_not_available");

  const path = buildTargetPath(args.target, args.index);
  if (!path.ok) return path;

  const { data, error } = await deps.reader
    .from("saved_documents")
    .select("id, kind, title, payload, created_at, updated_at")
    .eq("id", deps.documentId)
    .maybeSingle();
  if (error || !data) return fail("document_not_found");
  const row = data as AuthoritativeDocumentRow;
  if (!row.updated_at) return fail("document_not_found");

  // Предложението има смисъл САМО ако прочетеният ред е ТОЧНО състоянието, което
  // моделът е видял. Версията се преизчислява от същия ред със същия помощник,
  // който обвързва разговора — при разлика няма предложение.
  const currentVersion = await computeContextVersion({
    kind: "saved_document",
    entityId: deps.documentId,
    fields: {
      title: row.title ?? null,
      kind: row.kind ?? null,
      payload: row.payload ?? null,
      created_at: row.created_at ?? null,
    },
  });
  if (currentVersion !== deps.contextVersion) return fail("stale_context");

  // Разговорът се препрочита през RLS: същият потребител, същият документ и
  // ТОЧНО същата базова версия. Иначе контекстът е сменен между ходовете.
  const threadRes = await deps.reader
    .from("assistant_threads")
    .select("id, user_id, context_kind, context_entity_id, context_version")
    .eq("id", deps.threadId)
    .maybeSingle();
  const thread = threadRes.data as Record<string, unknown> | null;
  if (threadRes.error || !thread) return fail("stale_context");
  if (
    String(thread.user_id ?? "") !== deps.userId ||
    String(thread.context_kind ?? "") !== "saved_document" ||
    String(thread.context_entity_id ?? "") !== deps.documentId ||
    String(thread.context_version ?? "") !== deps.contextVersion
  ) {
    return fail("stale_context");
  }

  const leaf = resolveTargetLeaf(
    row,
    args.target as EditTarget,
    typeof args.index === "number" ? args.index : undefined,
  );
  if (!leaf.ok) return leaf;

  const replacement = sanitizeReplacement(args.replacement, deps.restore);
  if (!replacement.ok) return replacement;
  if (replacement.text === leaf.before) return fail("identical_text");

  const reason = sanitizeReason(args.reason, deps.restore);
  if (!reason.ok) return reason;

  const insert = {
    user_id: deps.userId,
    thread_id: deps.threadId,
    saved_document_id: deps.documentId,
    base_context_version: deps.contextVersion,
    base_updated_at: row.updated_at as string,
    target_path: path.path,
    before_text: leaf.before,
    after_text: replacement.text,
    reason: reason.text,
    status: "pending",
  };

  const res = await deps.writer
    .from("assistant_edit_proposals")
    .insert(insert)
    .select("id, status, target_path, before_text, after_text, reason, saved_document_id, thread_id, created_at")
    .maybeSingle();
  if (res.error || !res.data) return fail("persist_failed");

  return { ok: true, proposal: res.data as ProposalRecord };
}

/* -------------------------------------------------------------------------
 * Преходи accept / reject / undo.
 *
 * Тази чиста функция е предпазна проверка в edge функцията ПРЕДИ атомарния
 * SQL преход, който повтаря същите правила под редови ключалки и е
 * авторитетен. Логиката е тук, за да е тествана детерминистично.
 * ------------------------------------------------------------------------- */

export type EditAction = "accept" | "reject" | "undo";

export type TransitionFailureCode =
  | "invalid_action"
  | "invalid_transition"
  | "stale_base"
  | "stale_value"
  | "stale_state"
  | "target_not_found";

export interface TransitionInput {
  action: EditAction | string;
  proposal: {
    status: string;
    base_updated_at: string;
    applied_updated_at?: string | null;
    before_text: string;
    after_text: string;
  };
  documentUpdatedAt: string;
  /** Текущата стойност на целевия низ (null = липсващ/нестингов лист). */
  currentTargetValue: string | null;
}

export type TransitionDecision =
  | { ok: true; effect: "apply" | "revert" | "mark_rejected" | "none"; idempotent: boolean }
  | { ok: false; code: TransitionFailureCode };

function sameInstant(a: string, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

export function decideEditTransition(input: TransitionInput): TransitionDecision {
  const { action, proposal: p } = input;
  if (action !== "accept" && action !== "reject" && action !== "undo") {
    return { ok: false, code: "invalid_action" };
  }

  if (action === "reject") {
    if (p.status === "rejected") return { ok: true, effect: "none", idempotent: true };
    if (p.status !== "pending") return { ok: false, code: "invalid_transition" };
    return { ok: true, effect: "mark_rejected", idempotent: false };
  }

  // Идемпотентността и противоречивите преходи се решават ПРЕДИ текущата
  // стойност на целта: повторното действие след загубен отговор трябва да е
  // стабилно и когато елементът вече не съществува.
  if (action === "accept") {
    if (p.status === "accepted") return { ok: true, effect: "none", idempotent: true };
    if (p.status !== "pending") return { ok: false, code: "invalid_transition" };
    if (input.currentTargetValue === null) return { ok: false, code: "target_not_found" };
    if (!sameInstant(input.documentUpdatedAt, p.base_updated_at)) {
      return { ok: false, code: "stale_base" };
    }
    if (input.currentTargetValue !== p.before_text) {
      return { ok: false, code: "stale_value" };
    }
    return { ok: true, effect: "apply", idempotent: false };
  }

  // undo
  if (p.status === "reverted") return { ok: true, effect: "none", idempotent: true };
  if (p.status !== "accepted") return { ok: false, code: "invalid_transition" };
  if (input.currentTargetValue === null) return { ok: false, code: "target_not_found" };
  if (!sameInstant(input.documentUpdatedAt, p.applied_updated_at ?? null)) {
    return { ok: false, code: "stale_state" };
  }
  if (input.currentTargetValue !== p.after_text) {
    return { ok: false, code: "stale_state" };
  }
  return { ok: true, effect: "revert", idempotent: false };
}

/* -------------------------------------------------------------------------
 * Разбор на канонична текстова форма на пътя обратно към семантична цел.
 * Ползва се от `assistant-edit`, за да прочете ТЕКУЩАТА стойност на целта от
 * авторитетния ред — без да се доверява на нищо от браузъра.
 * ------------------------------------------------------------------------- */

export function parseTargetPath(
  path: unknown,
): { target: EditTarget; index?: number } | null {
  if (typeof path !== "string") return null;
  if (path === "title") return { target: "title" };
  const simple = path.match(/^payload\.(intro|closing|text)$/);
  if (simple) return { target: simple[1] as EditTarget };
  // Точно поддържаните двойки: sections→heading|body, clauses→title|body.
  // Без водещи нули и без кръстосани двойки — същият whitelist като в SQL.
  const indexed = path.match(
    /^payload\.(?:(sections)\[(0|[1-9][0-9]{0,2})\]\.(heading|body)|(clauses)\[(0|[1-9][0-9]{0,2})\]\.(title|body))$/,
  );
  if (!indexed) return null;
  const collection = indexed[1] ?? indexed[4];
  const rawIndex = indexed[2] ?? indexed[5];
  const leaf = indexed[3] ?? indexed[6];
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index > MAX_INDEX) return null;
  const target = Object.keys(INDEXED_TARGETS).find((k) =>
    INDEXED_TARGETS[k].collection === collection && INDEXED_TARGETS[k].leaf === leaf
  ) as EditTarget | undefined;
  if (!target) return null;
  return { target, index };
}

/** Текуща стойност на целевия низ или null, ако листът липсва/не е низ. */
export function readLeafByPath(
  row: AuthoritativeDocumentRow,
  path: unknown,
): string | null {
  const parsed = parseTargetPath(path);
  if (!parsed) return null;
  const leaf = resolveTargetLeaf(row, parsed.target, parsed.index);
  return leaf.ok ? leaf.before : null;
}

/** Етикет на целта за интерфейса (на български, без технически път). */
export function targetLabel(path: unknown): string {
  const parsed = parseTargetPath(path);
  if (!parsed) return "Елемент от документа";
  switch (parsed.target) {
    case "title":
      return "Заглавие на документа";
    case "intro":
      return "Уводен текст";
    case "closing":
      return "Заключение";
    case "text":
      return "Текст на документа";
    case "section_heading":
      return `Заглавие на секция ${(parsed.index ?? 0) + 1}`;
    case "section_body":
      return `Текст на секция ${(parsed.index ?? 0) + 1}`;
    case "clause_title":
      return `Заглавие на клауза ${(parsed.index ?? 0) + 1}`;
    case "clause_body":
      return `Текст на клауза ${(parsed.index ?? 0) + 1}`;
  }
}
