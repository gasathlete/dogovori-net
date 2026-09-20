import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isSweepableRequestPath,
  sweepExpiredRequestArtifacts,
  type ArtifactRow,
} from "./artifact-sweep.ts";

interface FakeOpts {
  rows: ArtifactRow[];
  /** Обекти, които хранилището потвърждава като премахнати. */
  confirm?: (bucket: string, paths: string[]) => string[];
  /** Обекти, които ВСЕ ОЩЕ съществуват при проверката за наличие. */
  present?: string[];
  removeError?: string;
  listError?: string;
  markError?: string;
  queryError?: string;
  /** Симулира променена/дефектна заявка, която връща редове извън обхват. */
  ignoreFilters?: boolean;
}

function fakeDb(opts: FakeOpts) {
  const filters: Record<string, string> = {};
  const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
  const listCalls: Array<{ bucket: string; prefix: string; search?: string }> = [];
  const updates: Array<{ values: Record<string, unknown>; ids: string[] }> = [];
  let limitUsed = 0;

  // deno-lint-ignore no-explicit-any
  const chain: any = {
    eq: (c: string, v: string) => ((filters[c] = v), chain),
    like: (c: string, v: string) => ((filters[`like:${c}`] = v), chain),
    is: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: (n: number) => {
      limitUsed = n;
      if (opts.queryError) {
        return Promise.resolve({ data: null, error: { message: opts.queryError } });
      }
      // Симулира СЪРВЪРНОТО филтриране: партидата се пълни само с редове,
      // които отговарят на филтрите, точно както прави базата.
      const eligible = opts.ignoreFilters ? opts.rows : opts.rows.filter(
        (r) =>
          (!filters.scope || r.scope === filters.scope) &&
          (!filters["like:storage_path"] ||
            r.storage_path.startsWith(filters["like:storage_path"].replace("%", ""))),
      );
      return Promise.resolve({ data: eligible.slice(0, n), error: null });
    },
  };

  // deno-lint-ignore no-explicit-any
  const db: any = {
    from: () => ({
      select: () => chain,
      update: (values: Record<string, unknown>) => ({
        in: (_c: string, ids: string[]) => {
          updates.push({ values, ids });
          if (opts.markError && values.deleted_at) {
            return Promise.resolve({ error: { message: opts.markError } });
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removeCalls.push({ bucket, paths });
          if (opts.removeError) {
            return Promise.resolve({ data: null, error: { message: opts.removeError } });
          }
          const confirmed = opts.confirm ? opts.confirm(bucket, paths) : paths;
          return Promise.resolve({
            data: confirmed.map((name) => ({ name })),
            error: null,
          });
        },
        list: (prefix: string, o: { search?: string; limit?: number }) => {
          listCalls.push({ bucket, prefix, search: o.search });
          if (opts.listError) {
            return Promise.resolve({ data: null, error: { message: opts.listError } });
          }
          const present = (opts.present ?? []).filter((p) => p.startsWith(`${prefix}/`) || !prefix);
          const names = present
            .map((p) => p.slice(p.lastIndexOf("/") + 1))
            .filter((n) => !o.search || n === o.search);
          return Promise.resolve({ data: names.map((name) => ({ name })), error: null });
        },
      }),
    },
  };
  return { db, removeCalls, listCalls, updates, filters, limitUsed: () => limitUsed };
}

function row(id: string, path: string, scope = "request", bucket = "document-blanks"): ArtifactRow {
  return { id, bucket, storage_path: path, scope };
}

Deno.test("само пътища по заявка са в обхват", () => {
  assert(isSweepableRequestPath("request/abc/doc.docx"));
  assertEquals(isSweepableRequestPath("draft/abc/doc.docx"), false);
  assertEquals(isSweepableRequestPath("public/logo.png"), false);
});

Deno.test("филтърът по обхват и префикс е в заявката (без изяждане на партидата)", async () => {
  // 300 изтекли чернови + 2 файла по заявка: черновите не влизат в партидата.
  const drafts = Array.from({ length: 300 }, (_, i) => row(`d${i}`, `draft/${i}/x.docx`, "draft"));
  const requests = [row("r1", "request/1/a.docx"), row("r2", "request/2/b.docx")];
  const { db, filters, removeCalls } = fakeDb({ rows: [...drafts, ...requests] });

  const res = await sweepExpiredRequestArtifacts(db, { batchSize: 200 });

  assertEquals(filters.scope, "request");
  assertEquals(filters["like:storage_path"], "request/%");
  assertEquals(res.examined, 2);
  assertEquals(res.removed, 2);
  assertEquals(res.marked, 2);
  assertEquals(res.unresolved, 0);
  assertEquals(removeCalls[0].paths.length, 2);
});

Deno.test("различни хранилища се третират поотделно", async () => {
  const rows = [
    row("a", "request/1/a.docx", "request", "document-blanks"),
    row("b", "request/2/b.docx", "request", "generated-docs"),
  ];
  const { db, removeCalls } = fakeDb({ rows });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(removeCalls.length, 2);
  assertEquals(new Set(removeCalls.map((c) => c.bucket)).size, 2);
  assertEquals(res.removed, 2);
});

Deno.test("потвърдено отсъствие се брои като липсващ и се маркира", async () => {
  const rows = [row("a", "request/1/a.docx"), row("b", "request/2/b.docx")];
  const { db, updates, listCalls } = fakeDb({
    rows,
    confirm: () => ["request/1/a.docx"], // вторият е пропуснат в отговора
    present: [], // и проверката потвърждава, че наистина липсва
  });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.removed, 1);
  assertEquals(res.missing, 1);
  assertEquals(res.marked, 2);
  assertEquals(res.unresolved, 0);
  assertEquals(listCalls.length, 1);
  assertEquals(listCalls[0].search, "b.docx");
  assertEquals(updates[0].ids.length, 2);
});

Deno.test("пропуснат, но ВСЕ ОЩЕ наличен обект остава чакащ, не заличен", async () => {
  const rows = [row("a", "request/1/a.docx")];
  const { db, updates } = fakeDb({
    rows,
    confirm: () => [], // хранилището не потвърждава премахване
    present: ["request/1/a.docx"], // и обектът съществува
  });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.removed, 0);
  assertEquals(res.missing, 0);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 1);
  assertEquals(updates[0].values.delete_error, "object_still_present_after_remove");
  assertEquals(updates[0].values.deleted_at, undefined);
});

Deno.test("празен отговор от remove не маркира всичко като липсващо", async () => {
  const rows = [row("a", "request/1/a.docx"), row("b", "request/1/b.docx")];
  const { db } = fakeDb({
    rows,
    confirm: () => [], // data: [] — без потвърждение
    present: ["request/1/a.docx", "request/1/b.docx"],
  });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.marked, 0);
  assertEquals(res.missing, 0);
  assertEquals(res.unresolved, 2);
});

Deno.test("грешка при проверката за наличие оставя реда чакащ", async () => {
  const rows = [row("a", "request/1/a.docx")];
  const { db, updates } = fakeDb({ rows, confirm: () => [], listError: "list down" });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 1);
  assert(String(updates[0].values.delete_error).includes("existence_check_failed"));
});

Deno.test("грешка при триене се записва на реда и не се твърди заличаване", async () => {
  const rows = [row("a", "request/1/a.docx")];
  const { db, updates } = fakeDb({ rows, removeError: "storage down" });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.removed, 0);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 1);
  assertEquals(res.errors.length >= 1, true);
  assertEquals(updates[0].values.delete_error, "storage down");
  assertEquals(updates[0].values.deleted_at, undefined);
});

Deno.test("грешка при маркиране не се отчита като премахнат или маркиран ред", async () => {
  const rows = [row("a", "request/1/a.docx")];
  const { db } = fakeDb({ rows, markError: "update failed" });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.removed, 0);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 1);
  assert(res.errors.some((e) => e.includes("mark deleted")));
});

Deno.test("успешното маркиране изчиства предишна грешка", async () => {
  const { db, updates } = fakeDb({ rows: [row("a", "request/1/a.docx")] });
  await sweepExpiredRequestArtifacts(db);
  assertEquals(updates[0].values.delete_error, null);
  assert(typeof updates[0].values.deleted_at === "string");
});

Deno.test("повторен курс без изтекли редове е безопасен (идемпотентност)", async () => {
  const { db, removeCalls } = fakeDb({ rows: [] });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.examined, 0);
  assertEquals(res.removed, 0);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 0);
  assertEquals(removeCalls.length, 0);
  assertEquals(res.errors.length, 0);
});

Deno.test("грешка при заявката връща истинна нулева статистика", async () => {
  const { db } = fakeDb({ rows: [], queryError: "db down" });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.examined, 0);
  assertEquals(res.marked, 0);
  assertEquals(res.unresolved, 0);
  assert(res.errors[0].includes("db down"));
});

Deno.test("ред извън обхват, върнат по грешка, се пропуска в кода", async () => {
  // Дори при променена заявка кодът не пипа чужд път.
  const { db, removeCalls } = fakeDb({
    rows: [row("x", "public/logo.png", "request")],
    ignoreFilters: true,
  });
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.skipped_not_request, 1);
  assertEquals(removeCalls.length, 0);
});

Deno.test("размерът на партидата се ограничава", async () => {
  const { db, limitUsed } = fakeDb({ rows: [] });
  await sweepExpiredRequestArtifacts(db, { batchSize: 5000 });
  assertEquals(limitUsed(), 500);
});
