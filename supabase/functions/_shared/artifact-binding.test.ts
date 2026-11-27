import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bindArtifactToOperation,
  lookupBoundArtifact,
  verifyArtifactExists,
} from "./artifact-binding.ts";

const digest = "a".repeat(64);
const base = {
  operationId: "11111111-1111-4111-8111-111111111111",
  userId: "u-1",
  purpose: "download_blank",
  requestDigest: digest,
};

function rpcDb(data: unknown, error: { message: string } | null = null) {
  return { rpc: () => Promise.resolve({ data, error }) };
}

Deno.test("липсващо обвързване е нормално първо изпълнение", async () => {
  assertEquals(await lookupBoundArtifact(rpcDb({ found: false }), base), { status: "none" });
});

Deno.test("точно съвпадение връща обвързания файл за повторение", async () => {
  const r = await lookupBoundArtifact(
    rpcDb({
      found: true,
      ready: true,
      user_id: "u-1",
      purpose: "download_blank",
      request_digest: digest,
      bucket: "document-blanks",
      path: "request/x/a.docx",
    }),
    base,
  );
  assertEquals(r, { status: "match", bucket: "document-blanks", path: "request/x/a.docx" });
});

Deno.test("чужд потребител, цел или товар НЕ се поднася", async () => {
  const row = {
    found: true,
    ready: true,
    user_id: "u-1",
    purpose: "download_blank",
    request_digest: digest,
    bucket: "b",
    path: "p/a.docx",
  };
  assertEquals(
    (await lookupBoundArtifact(rpcDb({ ...row, user_id: "u-2" }), base) as { reason: string }).reason,
    "user_mismatch",
  );
  assertEquals(
    (await lookupBoundArtifact(rpcDb({ ...row, purpose: "other" }), base) as { reason: string }).reason,
    "purpose_mismatch",
  );
  assertEquals(
    (await lookupBoundArtifact(rpcDb({ ...row, request_digest: "b".repeat(64) }), base) as { reason: string })
      .reason,
    "digest_mismatch",
  );
  assertEquals(
    (await lookupBoundArtifact(rpcDb({ ...row, path: "" }), base) as { reason: string }).reason,
    "path_missing",
  );
});

Deno.test("незавършен или недостъпен запис не е нито наличен, нито липсващ", async () => {
  const notReady = await lookupBoundArtifact(
    rpcDb({ found: true, ready: false, user_id: "u-1", purpose: "download_blank", request_digest: digest }),
    base,
  );
  assertEquals(notReady, { status: "unavailable", reason: "artifact_not_ready" });
  const down = await lookupBoundArtifact(rpcDb(null, { message: "rpc down" }), base);
  assertEquals(down, { status: "unavailable", reason: "lookup_failed" });
});

function storage(
  result: { data: Array<{ name: string }> | null; error: { message: string } | null },
) {
  return { from: () => ({ list: () => Promise.resolve(result) }) };
}

Deno.test("съществуването на обекта се доказва, а не се предполага", async () => {
  assertEquals(
    await verifyArtifactExists(storage({ data: [{ name: "a.docx" }], error: null }), "b", "p/a.docx"),
    "present",
  );
  assertEquals(
    await verifyArtifactExists(storage({ data: [], error: null }), "b", "p/a.docx"),
    "absent",
  );
  assertEquals(
    await verifyArtifactExists(storage({ data: null, error: { message: "down" } }), "b", "p/a.docx"),
    "unknown",
  );
  assertEquals(
    await verifyArtifactExists(
      { from: () => ({ list: () => Promise.reject(new Error("boom")) }) },
      "b",
      "p/a.docx",
    ),
    "unknown",
  );
});

Deno.test("обвързването е идемпотентно, а конфликтът е отделен изход", async () => {
  assertEquals(
    await bindArtifactToOperation(rpcDb({ ok: true, replay: false }), {
      ...base,
      bucket: "b",
      storagePath: "p/a.docx",
      expiresAt: new Date().toISOString(),
    }),
    { status: "bound", replay: false },
  );
  assertEquals(
    await bindArtifactToOperation(rpcDb({ ok: true, replay: true }), {
      ...base,
      bucket: "b",
      storagePath: "p/a.docx",
      expiresAt: new Date().toISOString(),
    }),
    { status: "bound", replay: true },
  );
  assertEquals(
    await bindArtifactToOperation(rpcDb(null, { message: "artifact_binding_conflict" }), {
      ...base,
      bucket: "b",
      storagePath: "p/other.docx",
      expiresAt: new Date().toISOString(),
    }),
    { status: "conflict", reason: "artifact_binding_conflict" },
  );
  assertEquals(
    await bindArtifactToOperation(rpcDb(null, { message: "db down" }), {
      ...base,
      bucket: "b",
      storagePath: "p/a.docx",
      expiresAt: new Date().toISOString(),
    }),
    { status: "unavailable", reason: "artifact_bind_failed" },
  );
  assertEquals(
    await bindArtifactToOperation(rpcDb({ ok: false }), {
      ...base,
      bucket: "b",
      storagePath: "p/a.docx",
      expiresAt: new Date().toISOString(),
    }),
    { status: "unavailable", reason: "artifact_bind_failed" },
  );
});
