/**
 * Изходи на резервацията на вълна след 0037.
 *
 * Доказваме, че изтеклият лизинг и недоказаното възстановяване НЕ водят до
 * втора резервация, а потвърдена вълна без наличен точен товар изисква НОВА
 * заявка вместо празен отговор.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reserveQuotaWave, type WaveBinding } from "./quota-ledger.ts";

const DIGEST = "a".repeat(64);

function stubDb(row: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({ data: row, error: null });
    },
  };
}

const binding: WaveBinding = {
  operationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  kind: "analysis",
  purpose: "apply_corrections",
  sessionId: "s-1",
  docKey: "doc-1",
  batchId: "33333333-3333-4333-8333-333333333333",
  requestDigest: DIGEST,
  opsCount: 2,
};

Deno.test("изтекъл лизинг връща изравняване, не нова резервация", async () => {
  const db = stubDb({ status: "reconciliation", reason: "lease_expired" });
  const out = await reserveQuotaWave(db as never, binding);
  assertEquals(out.status, "reconciliation");
  if (out.status === "reconciliation") assertEquals(out.reason, "lease_expired");
  assertEquals(db.calls, ["quota_wave_reserve"]);
});

Deno.test("недоказано възстановяване връща изравняване", async () => {
  const db = stubDb({ status: "reconciliation", reason: "restoration_unproven" });
  const out = await reserveQuotaWave(db as never, binding);
  assertEquals(out.status, "reconciliation");
  if (out.status === "reconciliation") assertEquals(out.reason, "restoration_unproven");
});

Deno.test("потвърдена вълна с изтекъл товар изисква нова заявка", async () => {
  const db = stubDb({ status: "response_expired", new_request_required: true });
  const out = await reserveQuotaWave(db as never, binding);
  assertEquals(out.status, "response_expired");
  if (out.status === "response_expired") assertEquals(out.charged, true);
});

Deno.test("липсващ отпечатък не стига до базата", async () => {
  const db = stubDb({ status: "reserved" });
  const out = await reserveQuotaWave(db as never, { ...binding, requestDigest: "nope" });
  assertEquals(out.status, "conflict");
  assertEquals(db.calls.length, 0);
});
