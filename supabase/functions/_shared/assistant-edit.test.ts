import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  boundedReason,
  buildTargetPath,
  decideEditTransition,
  parseTargetPath,
  proposeSavedDocumentEdit,
  readLeafByPath,
  REPLACEMENT_MAX,
  resolveTargetLeaf,
  sanitizeReplacement,
  targetLabel,
} from "./assistant-edit.ts";
import { unredact } from "./redact.ts";

const BASE_UPDATED = "2026-02-01T10:00:00.000Z";
const APPLIED_UPDATED = "2026-02-01T11:00:00.000Z";
const VERSION = "a".repeat(64);

const DOC = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "contract",
  title: "Договор за наем",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: BASE_UPDATED,
  payload: {
    intro: "Уводен текст",
    closing: "Заключение",
    sections: [{ heading: "Предмет", body: "Тяло на секция" }, { heading: "", body: "Второ" }],
    clauses: [{ title: "Неустойки", body: "Тяло на клауза" }],
  },
};

/* ----------------------------- fake clients ----------------------------- */

function reader(row: unknown, error: unknown = null) {
  return {
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error }) }),
      }),
    }),
  };
}

function writer() {
  const inserts: any[] = [];
  return {
    inserts,
    client: {
      from: (_t: string) => ({
        insert: (row: any) => {
          inserts.push(row);
          return {
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "22222222-2222-4222-8222-222222222222",
                    status: "pending",
                    target_path: row.target_path,
                    before_text: row.before_text,
                    after_text: row.after_text,
                    reason: row.reason,
                    saved_document_id: row.saved_document_id,
                    thread_id: row.thread_id,
                    created_at: BASE_UPDATED,
                  },
                  error: null,
                }),
            }),
          };
        },
      }),
    },
  };
}

function deps(overrides: Record<string, unknown> = {}, docRow: unknown = DOC) {
  const w = writer();
  return {
    w,
    deps: {
      reader: reader(docRow),
      writer: w.client,
      userId: "33333333-3333-4333-8333-333333333333",
      threadId: "44444444-4444-4444-8444-444444444444",
      documentId: DOC.id,
      contextVersion: VERSION,
      contextTruncated: false,
      restore: (t: string) => t,
      ...overrides,
    } as any,
  };
}

/* -------------------------------- paths --------------------------------- */

Deno.test("buildTargetPath: whitelist and index rules", () => {
  assertEquals(buildTargetPath("title"), { ok: true, path: "title" });
  assertEquals(buildTargetPath("intro"), { ok: true, path: "payload.intro" });
  assertEquals(buildTargetPath("section_body", 2), {
    ok: true,
    path: "payload.sections[2].body",
  });
  assertEquals(buildTargetPath("clause_title", 0), {
    ok: true,
    path: "payload.clauses[0].title",
  });
  assertEquals(buildTargetPath("payload"), { ok: false, code: "invalid_target" });
  assertEquals(buildTargetPath("user_id"), { ok: false, code: "invalid_target" });
  assertEquals(buildTargetPath("section_body"), { ok: false, code: "invalid_index" });
  assertEquals(buildTargetPath("section_body", -1), { ok: false, code: "invalid_index" });
  assertEquals(buildTargetPath("section_body", 1.5), { ok: false, code: "invalid_index" });
  assertEquals(buildTargetPath("section_body", 200), { ok: false, code: "invalid_index" });
});

Deno.test("parseTargetPath / readLeafByPath round trip", () => {
  assertEquals(parseTargetPath("title"), { target: "title" });
  assertEquals(parseTargetPath("payload.sections[1].heading"), {
    target: "section_heading",
    index: 1,
  });
  assertEquals(parseTargetPath("payload.other"), null);
  assertEquals(parseTargetPath("payload.sections[1].user_id"), null);
  assertEquals(readLeafByPath(DOC, "payload.sections[0].body"), "Тяло на секция");
  assertEquals(readLeafByPath(DOC, "title"), "Договор за наем");
  assertEquals(readLeafByPath(DOC, "payload.sections[1].heading"), null); // празен низ
  assertEquals(readLeafByPath(DOC, "payload.sections[9].body"), null);
});

Deno.test("targetLabel is human readable Bulgarian", () => {
  assertEquals(targetLabel("title"), "Заглавие на документа");
  assertEquals(targetLabel("payload.clauses[0].body"), "Текст на клауза 1");
});

/* ---------------------------- authoritative before ---------------------- */

Deno.test("resolveTargetLeaf reads only existing string leaves", () => {
  assertEquals(resolveTargetLeaf(DOC, "intro"), { ok: true, before: "Уводен текст" });
  assertEquals(resolveTargetLeaf(DOC, "text"), { ok: false, code: "target_not_found" });
  assertEquals(resolveTargetLeaf(DOC, "clause_body", 5), { ok: false, code: "invalid_index" });
  assertEquals(
    resolveTargetLeaf({ id: "x", payload: { sections: "нещо" } }, "section_body", 0),
    { ok: false, code: "target_not_found" },
  );
  assertEquals(
    resolveTargetLeaf({ id: "x", payload: null }, "intro"),
    { ok: false, code: "target_not_found" },
  );
});

Deno.test("sanitizeReplacement: restore, bounds, unresolved tokens", () => {
  const mapping = { "<NAME_1>": "Иван Петров" };
  const restore = (t: string) => unredact(t, mapping);
  assertEquals(sanitizeReplacement("  Наемател <NAME_1>  ", restore), {
    ok: true,
    text: "Наемател Иван Петров",
  });
  assertEquals(sanitizeReplacement("Наемател <NAME_7>", restore), {
    ok: false,
    code: "unresolved_redaction",
  });
  assertEquals(sanitizeReplacement("   ", restore), { ok: false, code: "replacement_invalid" });
  assertEquals(sanitizeReplacement(42, restore), { ok: false, code: "replacement_invalid" });
  assertEquals(sanitizeReplacement("x".repeat(REPLACEMENT_MAX + 1), restore), {
    ok: false,
    code: "replacement_too_long",
  });
});

Deno.test("boundedReason trims, collapses and caps", () => {
  assertEquals(boundedReason("  по-ясна\n формулировка "), "по-ясна формулировка");
  assertEquals(boundedReason(""), null);
  assertEquals(boundedReason(123), null);
  assertEquals(boundedReason("я".repeat(400))?.length, 300);
});

/* --------------------------- proposal creation -------------------------- */

Deno.test("propose: persists exactly one pending proposal, no document write", async () => {
  const { w, deps: d } = deps();
  const res = await proposeSavedDocumentEdit(d, {
    target: "section_body",
    index: 0,
    replacement: "Ново тяло на секция",
    reason: "по-точен предмет",
  });
  assertEquals(res.ok, true);
  assertEquals(w.inserts.length, 1);
  const ins = w.inserts[0];
  assertEquals(ins.target_path, "payload.sections[0].body");
  assertEquals(ins.before_text, "Тяло на секция");
  assertEquals(ins.after_text, "Ново тяло на секция");
  assertEquals(ins.status, "pending");
  assertEquals(ins.base_updated_at, BASE_UPDATED);
  assertEquals(ins.base_context_version, VERSION);
  assertEquals(ins.user_id, d.userId);
  assertEquals(ins.thread_id, d.threadId);
  assertEquals(ins.saved_document_id, DOC.id);
  // Само таблицата с предложения е писана.
  assertEquals(Object.keys(ins).includes("payload"), false);
});

Deno.test("propose: model-supplied ids/versions/before are ignored", async () => {
  const { w, deps: d } = deps();
  const res = await proposeSavedDocumentEdit(d, {
    target: "title",
    replacement: "Ново заглавие",
    // нарочно подадени полета, които сървърът не бива да чете
    before: "измислен стар текст",
    user_id: "нечий друг",
    saved_document_id: "друг документ",
    base_context_version: "b".repeat(64),
  } as any);
  assertEquals(res.ok, true);
  const ins = w.inserts[0];
  assertEquals(ins.before_text, "Договор за наем");
  assertEquals(ins.user_id, d.userId);
  assertEquals(ins.saved_document_id, DOC.id);
  assertEquals(ins.base_context_version, VERSION);
});

Deno.test("propose: rejects truncated context, identical text, bad target", async () => {
  const truncated = deps({ contextTruncated: true });
  assertEquals(
    await proposeSavedDocumentEdit(truncated.deps, { target: "title", replacement: "X" }),
    { ok: false, code: "edit_not_available" },
  );
  assertEquals(truncated.w.inserts.length, 0);

  const same = deps();
  assertEquals(
    await proposeSavedDocumentEdit(same.deps, { target: "title", replacement: "Договор за наем" }),
    { ok: false, code: "identical_text" },
  );
  assertEquals(same.w.inserts.length, 0);

  const badTarget = deps();
  assertEquals(
    await proposeSavedDocumentEdit(badTarget.deps, { target: "payload", replacement: "X" }),
    { ok: false, code: "invalid_target" },
  );
  assertEquals(badTarget.w.inserts.length, 0);

  const missing = deps({}, null);
  assertEquals(
    await proposeSavedDocumentEdit(missing.deps, { target: "title", replacement: "X" }),
    { ok: false, code: "document_not_found" },
  );
  assertEquals(missing.w.inserts.length, 0);
});

Deno.test("propose: foreign actor sees no row through RLS reader", async () => {
  // RLS-обхванатият reader не връща ред → няма достъп, няма запис.
  const foreign = deps({ reader: reader(null) });
  assertEquals(
    await proposeSavedDocumentEdit(foreign.deps, { target: "intro", replacement: "X" }),
    { ok: false, code: "document_not_found" },
  );
  assertEquals(foreign.w.inserts.length, 0);
});

Deno.test("propose: unresolved redaction token never persists", async () => {
  const d = deps({ restore: (t: string) => t });
  assertEquals(
    await proposeSavedDocumentEdit(d.deps, { target: "intro", replacement: "Наемател <EGN_1>" }),
    { ok: false, code: "unresolved_redaction" },
  );
  assertEquals(d.w.inserts.length, 0);
});

/* ------------------------------ transitions ----------------------------- */

const pending = {
  status: "pending",
  base_updated_at: BASE_UPDATED,
  applied_updated_at: null,
  before_text: "Тяло на секция",
  after_text: "Ново тяло",
};

Deno.test("accept: CAS success only on exact base and value", () => {
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: pending,
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: true, effect: "apply", idempotent: false },
  );
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: pending,
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: false, code: "stale_base" },
  );
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: pending,
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "ръчно променено",
    }),
    { ok: false, code: "stale_value" },
  );
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: pending,
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: null,
    }),
    { ok: false, code: "target_not_found" },
  );
});

Deno.test("duplicate accept / reject are idempotent, contradictions fail", () => {
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: { ...pending, status: "accepted", applied_updated_at: APPLIED_UPDATED },
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "Ново тяло",
    }),
    { ok: true, effect: "none", idempotent: true },
  );
  assertEquals(
    decideEditTransition({
      action: "reject",
      proposal: { ...pending, status: "rejected" },
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: true, effect: "none", idempotent: true },
  );
  assertEquals(
    decideEditTransition({
      action: "reject",
      proposal: { ...pending, status: "accepted", applied_updated_at: APPLIED_UPDATED },
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "Ново тяло",
    }),
    { ok: false, code: "invalid_transition" },
  );
  assertEquals(
    decideEditTransition({
      action: "accept",
      proposal: { ...pending, status: "rejected" },
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: false, code: "invalid_transition" },
  );
});

Deno.test("reject decision never touches the document", () => {
  const d = decideEditTransition({
    action: "reject",
    proposal: pending,
    documentUpdatedAt: BASE_UPDATED,
    currentTargetValue: "Тяло на секция",
  });
  assertEquals(d, { ok: true, effect: "mark_rejected", idempotent: false });
});

Deno.test("undo: only from exact accepted state", () => {
  const accepted = {
    ...pending,
    status: "accepted",
    applied_updated_at: APPLIED_UPDATED,
  };
  assertEquals(
    decideEditTransition({
      action: "undo",
      proposal: accepted,
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "Ново тяло",
    }),
    { ok: true, effect: "revert", idempotent: false },
  );
  // Документът е променян след прилагането.
  assertEquals(
    decideEditTransition({
      action: "undo",
      proposal: accepted,
      documentUpdatedAt: "2026-02-01T12:00:00.000Z",
      currentTargetValue: "Ново тяло",
    }),
    { ok: false, code: "stale_state" },
  );
  // Целевият текст е променян ръчно.
  assertEquals(
    decideEditTransition({
      action: "undo",
      proposal: accepted,
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "нещо друго",
    }),
    { ok: false, code: "stale_state" },
  );
  assertEquals(
    decideEditTransition({
      action: "undo",
      proposal: pending,
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: false, code: "invalid_transition" },
  );
  assertEquals(
    decideEditTransition({
      action: "undo",
      proposal: { ...accepted, status: "reverted" },
      documentUpdatedAt: APPLIED_UPDATED,
      currentTargetValue: "Ново тяло",
    }),
    { ok: true, effect: "none", idempotent: true },
  );
});

Deno.test("unknown action is refused", () => {
  assertEquals(
    decideEditTransition({
      action: "delete",
      proposal: pending,
      documentUpdatedAt: BASE_UPDATED,
      currentTargetValue: "Тяло на секция",
    }),
    { ok: false, code: "invalid_action" },
  );
});
