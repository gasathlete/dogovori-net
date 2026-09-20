import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSweepableRequestPath, sweepExpiredRequestArtifacts } from "./artifact-sweep.ts";

function fakeDb(rows: Array<Record<string, unknown>>, opts: { removeError?: string } = {}) {
  const removed: string[] = [];
  const marked: string[] = [];
  return {
    removed,
    marked,
    from(_t: string) {
      return {
        select: (_c: string) => ({
          is: (_col: string, _v: null) => ({
            lt: (_c2: string, _v2: string) => ({
              limit: (_n: number) => Promise.resolve({ data: rows as never, error: null }),
            }),
          }),
        }),
        update: (_v: Record<string, unknown>) => ({
          in: (_col: string, vals: string[]) => {
            marked.push(...vals);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    storage: {
      from(_b: string) {
        return {
          remove: (paths: string[]) => {
            if (opts.removeError) return Promise.resolve({ data: null, error: { message: opts.removeError } });
            removed.push(...paths);
            return Promise.resolve({ data: paths, error: null });
          },
        };
      },
    },
  };
}

Deno.test("само пътища по заявка са заличими", () => {
  assertEquals(isSweepableRequestPath("request/abc/x.docx"), true);
  assertEquals(isSweepableRequestPath("draft/abc/x.docx"), false);
  assertEquals(isSweepableRequestPath("v6/sector/doc.docx"), false);
});

Deno.test("изтеклите файлове по заявка се трият и маркират", async () => {
  const db = fakeDb([
    { id: "a1", bucket: "document-blanks", storage_path: "request/u1/x.docx", scope: "request" },
  ]);
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.deleted, 1);
  assertEquals(db.removed, ["request/u1/x.docx"]);
  assertEquals(db.marked, ["a1"]);
});

Deno.test("публични и draft обекти не се пипат", async () => {
  const db = fakeDb([
    { id: "p1", bucket: "document-blanks", storage_path: "v6/sector/doc.docx", scope: "request" },
    { id: "d1", bucket: "document-blanks", storage_path: "draft/u1/x.docx", scope: "draft" },
  ]);
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.deleted, 0);
  assertEquals(res.skipped_not_request, 2);
  assertEquals(db.removed.length, 0);
  assertEquals(db.marked.length, 0);
});

Deno.test("повторен курс не трие втори път (вече маркираните не се избират)", async () => {
  const db = fakeDb([]);
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res, { examined: 0, deleted: 0, skipped_not_request: 0, errors: [] });
});

Deno.test("грешка при триене се отчита истинно и не се маркира като изтрито", async () => {
  const db = fakeDb(
    [{ id: "a1", bucket: "document-blanks", storage_path: "request/u1/x.docx", scope: "request" }],
    { removeError: "network" },
  );
  const res = await sweepExpiredRequestArtifacts(db);
  assertEquals(res.deleted, 0);
  assertEquals(res.errors.length, 1);
  assertEquals(db.marked.length, 0);
});

Deno.test("партидата е ограничена", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `a${i}`,
    bucket: "document-blanks",
    storage_path: `request/u/${i}.docx`,
    scope: "request",
  }));
  const db = fakeDb(rows);
  const res = await sweepExpiredRequestArtifacts(db, { batchSize: 1000 });
  assertEquals(res.examined, 10);
  assertEquals(res.deleted, 10);
});
