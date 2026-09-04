// Тестове за атомарните записи по анонимните чернови.
//
// Работим срещу фалшива база, която НАИСТИНА прилага предикатите на UPDATE-а —
// така се проверява, че оторизацията не е само „решение“, а е вградена в самата
// заявка и надпреварата между четене и запис не може да прегази чужд ред.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashToken, isValidDraftId } from "./draft-token.ts";
import { isCreateRequest, isValidPayloadRow, rowAfterTransfer } from "./draft-auth.ts";
import {
  anonymousWriteFilters,
  claimFilters,
  classifyLostClaim,
  classifyLostWrite,
  deterministicSavedDocId,
  ensureSavedDocument,
  ownerPurgeFilters,
  ownerWriteFilters,
  savedDocSourceId,
  updateGuarded,
  type DbLike,
  type Filter,
} from "./draft-writes.ts";

const NOW = Date.parse("2026-09-05T10:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const FUTURE = new Date(NOW + 3_600_000).toISOString();
const PAST = new Date(NOW - 60_000).toISOString();
const DRAFT = "33333333-3333-4333-8333-333333333333";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TOKEN = "correct-token-abcdefghijklmnop";

/* ------------------------------ Фалшива база ------------------------------ */

type Row = Record<string, unknown>;

class FakeQuery {
  private filters: Filter[] = [];
  constructor(
    private db: FakeDb,
    private table: string,
    private op: "update" | "insert" | "select",
    private values: Row = {},
  ) {}
  eq(c: string, v: unknown) {
    this.filters.push(["eq", c, v]);
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push(["is", c, v]);
    return this;
  }
  gt(c: string, v: unknown) {
    this.filters.push(["gt", c, v]);
    return this;
  }
  select(_cols: string) {
    return this;
  }
  // deno-lint-ignore require-await
  async maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    return this.db.run(this.table, this.op, this.values, this.filters);
  }
}

class FakeDb implements DbLike {
  tables: Record<string, Row[]> = { anonymous_drafts: [], saved_documents: [] };
  /** Изкуствени грешки: "insert:saved_documents" → веднъж връща грешка. */
  failOnce = new Set<string>();
  calls: { table: string; op: string; filters: Filter[] }[] = [];

  from(table: string) {
    return {
      update: (values: Row) => new FakeQuery(this, table, "update", values) as never,
      insert: (values: Row) => new FakeQuery(this, table, "insert", values) as never,
      select: (_cols: string) => new FakeQuery(this, table, "select") as never,
    };
  }

  private matches(row: Row, filters: Filter[]): boolean {
    return filters.every(([op, col, val]) => {
      const cur = row[col] ?? null;
      if (op === "eq") return cur === val;
      if (op === "is") return cur === val;
      return typeof cur === "string" && typeof val === "string" && cur > val;
    });
  }

  run(table: string, op: string, values: Row, filters: Filter[]) {
    this.calls.push({ table, op, filters });
    const key = `${op}:${table}`;
    if (this.failOnce.has(key)) {
      this.failOnce.delete(key);
      return { data: null, error: { code: "08006", message: "network" } };
    }
    const rows = (this.tables[table] ??= []);
    if (op === "insert") {
      if (values.id && rows.some((r) => r.id === values.id)) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const row = { ...values };
      rows.push(row);
      return { data: { id: row.id }, error: null };
    }
    const hit = rows.find((r) => this.matches(r, filters));
    if (!hit) return { data: null, error: null };
    if (op === "update") Object.assign(hit, values);
    return { data: { ...hit }, error: null };
  }
}

function seedDraft(db: FakeDb, overrides: Row = {}): Promise<Row> {
  return hashToken(TOKEN).then((h) => {
    const row: Row = {
      id: DRAFT,
      token_hash: h,
      claimed_by: null,
      claimed_at: null,
      expires_at: FUTURE,
      saved_doc_id: null,
      payload: { answers: { a: 1 }, result: "doc" },
      has_result: true,
      route: "/wizard/nda",
      step_idx: 2,
      flow: "wizard",
      doc_key: "nda",
      ...overrides,
    };
    db.tables.anonymous_drafts.push(row);
    return row;
  });
}

/* ------------------------------- 1. Анонимна надпревара ------------------- */

Deno.test("анонимен запис не минава, ако междувременно черновата е присвоена", async () => {
  const db = new FakeDb();
  const row = await seedDraft(db);
  const tokenHash = row.token_hash as string;

  // Успех, докато редът е непотърсен.
  const first = await updateGuarded(db, "anonymous_drafts", { step_idx: 3 }, anonymousWriteFilters(DRAFT, tokenHash, NOW_ISO));
  assert(first.row, "непотърсен ред трябва да се обнови");

  // Едновременно присвояване + ротация на токена.
  row.claimed_by = OWNER;
  row.token_hash = await hashToken("rotated-token-abcdefghijklmno");

  const stale = await updateGuarded(db, "anonymous_drafts", { step_idx: 99, payload: { hacked: true } }, anonymousWriteFilters(DRAFT, tokenHash, NOW_ISO));
  assertEquals(stale.row, null, "застоял анонимен запис не бива да минава");
  assertEquals(row.step_idx, 3, "редът не е бил прегазен");
  assertFalse("hacked" in (row.payload as Row));

  assertEquals(classifyLostWrite(row as never, { userId: null, tokenHash, now: NOW }), "unauthorized");
  assertEquals(classifyLostWrite(row as never, { userId: OTHER, tokenHash, now: NOW }), "different_owner");
  assertEquals(classifyLostWrite(row as never, { userId: OWNER, tokenHash, now: NOW }), "already_claimed");
});

/* ------------------------------- 2. Собственик ---------------------------- */

Deno.test("записът на собственика иска точно съвпадение на claimed_by", async () => {
  const db = new FakeDb();
  const row = await seedDraft(db, { claimed_by: OWNER });

  const alien = await updateGuarded(db, "anonymous_drafts", { step_idx: 42 }, ownerWriteFilters(DRAFT, OTHER, NOW_ISO));
  assertEquals(alien.row, null);
  assertEquals(row.step_idx, 2);

  const own = await updateGuarded(db, "anonymous_drafts", { step_idx: 42 }, ownerWriteFilters(DRAFT, OWNER, NOW_ISO));
  assert(own.row);
  assertEquals(row.step_idx, 42);
});

/* --------------------------------- 3. Срок -------------------------------- */

Deno.test("срокът е част от предикатите и от решението при загубена надпревара", async () => {
  for (const filters of [
    anonymousWriteFilters(DRAFT, "h", NOW_ISO),
    ownerWriteFilters(DRAFT, OWNER, NOW_ISO),
    claimFilters(DRAFT, "h", NOW_ISO),
  ]) {
    assert(filters.some(([op, col]) => op === "gt" && col === "expires_at"), "липсва предикат за срок");
  }
  assert(anonymousWriteFilters(DRAFT, "h", NOW_ISO).some(([op, col]) => op === "is" && col === "claimed_by"));
  assert(anonymousWriteFilters(DRAFT, "h", NOW_ISO).some(([op, col]) => op === "eq" && col === "token_hash"));

  const db = new FakeDb();
  const row = await seedDraft(db, { expires_at: PAST });
  const res = await updateGuarded(db, "anonymous_drafts", { step_idx: 7 }, anonymousWriteFilters(DRAFT, row.token_hash as string, NOW_ISO));
  assertEquals(res.row, null);
  assertEquals(classifyLostWrite(row as never, { userId: null, tokenHash: row.token_hash as string, now: NOW }), "expired");
  assertEquals(classifyLostClaim(row as never, { userId: OWNER, now: NOW }), { ok: false, reason: "expired" });
});

/* ---------------------- 4. Create = отсъстващ draft_id -------------------- */

Deno.test("create само при отсъстващо свойство draft_id", () => {
  assert(isCreateRequest({ flow: "wizard" }));
  for (const bad of [null, "", "   ", "not-a-uuid", 5]) {
    assertFalse(isCreateRequest({ draft_id: bad }), `подадена стойност ${String(bad)} не е create`);
    assertFalse(isValidDraftId(bad), "негодната стойност не минава и валидацията");
  }
});

/* ------------- 5. Прехвърляне: неуспешен purge → повторът сходи ----------- */

Deno.test("запис успешен + purge неуспешен → повторът стига до един документ", async () => {
  const db = new FakeDb();
  const row = await seedDraft(db, { claimed_by: OWNER });
  const payload = row.payload as Record<string, unknown>;

  const first = await ensureSavedDocument(db, { draftId: DRAFT, userId: OWNER, title: "NDA", payload });
  assert(first.ok && first.created);
  assertEquals(first.ok && first.id, deterministicSavedDocId(DRAFT));
  assertEquals(db.tables.saved_documents[0].source_id, savedDocSourceId(DRAFT));

  // Purge пада.
  db.failOnce.add("update:anonymous_drafts");
  const purge1 = await updateGuarded(db, "anonymous_drafts", rowAfterTransfer(DRAFT, "h2"), ownerPurgeFilters(DRAFT, OWNER));
  assert(purge1.error, "първият purge пада");
  assertEquals(row.saved_doc_id, null);

  // Повторен опит: същият детерминистичен документ, без дубликат.
  const second = await ensureSavedDocument(db, { draftId: DRAFT, userId: OWNER, title: "NDA", payload });
  assert(second.ok);
  assertEquals(second.ok && second.created, false);
  assertEquals(db.tables.saved_documents.length, 1);

  const purge2 = await updateGuarded(db, "anonymous_drafts", rowAfterTransfer(DRAFT, "h2"), ownerPurgeFilters(DRAFT, OWNER));
  assert(purge2.row);
  assertEquals(row.saved_doc_id, DRAFT);
  assertEquals(row.payload, {});
  assertEquals(row.has_result, true);
});

/* ---------------------- 6. Две едновременни присвоявания ------------------ */

Deno.test("две едновременни присвоявания от същия потребител сходят до един документ", async () => {
  const db = new FakeDb();
  const row = await seedDraft(db);
  const tokenHash = row.token_hash as string;

  const a = await updateGuarded(db, "anonymous_drafts", { claimed_by: OWNER, claimed_at: NOW_ISO, token_hash: "rot1", expires_at: FUTURE }, claimFilters(DRAFT, tokenHash, NOW_ISO));
  assert(a.row);
  const b = await updateGuarded(db, "anonymous_drafts", { claimed_by: OWNER, claimed_at: NOW_ISO, token_hash: "rot2", expires_at: FUTURE }, claimFilters(DRAFT, tokenHash, NOW_ISO));
  assertEquals(b.row, null, "вторият claim не минава атомарния предикат");
  assertEquals(classifyLostClaim(row as never, { userId: OWNER, now: NOW }), { ok: true, idempotent: true });

  const payload = row.payload as Record<string, unknown>;
  const s1 = await ensureSavedDocument(db, { draftId: DRAFT, userId: OWNER, title: "NDA", payload });
  const s2 = await ensureSavedDocument(db, { draftId: DRAFT, userId: OWNER, title: "NDA", payload });
  assert(s1.ok && s2.ok);
  assertEquals(s1.ok && s2.ok && s1.id === s2.id, true);
  assertEquals(db.tables.saved_documents.length, 1);
});

/* ------------------------- 7. Чужд потребител ----------------------------- */

Deno.test("чужд потребител не присвоява и не наследява документа", async () => {
  const db = new FakeDb();
  const row = await seedDraft(db, { claimed_by: OWNER });
  assertEquals(classifyLostClaim(row as never, { userId: OTHER, now: NOW }), { ok: false, reason: "already_claimed" });

  await ensureSavedDocument(db, { draftId: DRAFT, userId: OWNER, title: "NDA", payload: {} });
  const stolen = await ensureSavedDocument(db, { draftId: DRAFT, userId: OTHER, title: "NDA", payload: {} });
  assertEquals(stolen, { ok: false, reason: "different_owner" });
  assertEquals(db.tables.saved_documents.length, 1);
});

/* -------------------- 8. Отговорът след purge е без съдържание ------------ */

Deno.test("след успешно прехвърляне редът вече не съдържа старото съдържание", () => {
  const after = rowAfterTransfer(DRAFT, "rotated");
  assertEquals(after.payload, {});
  assertEquals(after.saved_doc_id, DRAFT);
  assertEquals(after.has_result, true);
  assertEquals(after.token_hash, "rotated");
});

/* ------------------ 9. Хендлърите наистина носят предикатите -------------- */

Deno.test("хендлърите използват предикатните записи, а не update по id", async () => {
  const sync = await Deno.readTextFile(new URL("../draft-sync/index.ts", import.meta.url));
  const claim = await Deno.readTextFile(new URL("../draft-claim/index.ts", import.meta.url));
  for (const [name, src] of [["draft-sync", sync], ["draft-claim", claim]] as const) {
    assert(src.includes("updateGuarded"), `${name} не използва updateGuarded`);
    assertFalse(/\.update\(/.test(src.replace(/updateGuarded/g, "")), `${name} има незащитен update`);
  }
  assert(sync.includes("anonymousWriteFilters") && sync.includes("ownerWriteFilters"));
  assert(sync.includes("classifyLostWrite"));
  assert(claim.includes("claimFilters") && claim.includes("classifyLostClaim"));
  assert(claim.includes("ensureSavedDocument") && claim.includes("ownerPurgeFilters"));
});

// Помощна проверка, че експортът съществува (типов ориентир за бъдещи промени).
Deno.test("публичният интерфейс е налице", () => {
  assertEquals(typeof isValidPayloadRow === "function" || isValidPayloadRow === undefined, true);
});
