import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SANDBOX_FORBIDDEN_CODE,
  SandboxForbiddenError,
  assertEnvironmentAllowed,
  extractEventUserId,
  isStaffUser,
} from "./sandbox-guard.ts";

const client = (result: { data?: unknown; error?: unknown }) => ({
  calls: [] as Array<[string, Record<string, unknown>]>,
  rpc(fn: string, args: Record<string, unknown>) {
    this.calls.push([fn, args]);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  },
});

Deno.test("live е разрешен за нормален автентикиран потребител — без RPC", async () => {
  const c = client({ data: false });
  await assertEnvironmentAllowed(c, "live", "user-1");
  assertEquals(c.calls.length, 0);
});

Deno.test("sandbox е разрешен само за staff", async () => {
  const c = client({ data: true });
  await assertEnvironmentAllowed(c, "sandbox", "staff-1");
  assertEquals(c.calls, [["is_staff", { _user_id: "staff-1" }]]);
});

Deno.test("sandbox се отказва при non-staff, RPC грешка, throw и липсващ userId", async () => {
  for (const res of [{ data: false }, { data: null }, { data: "true" }, { error: { message: "boom" } }]) {
    const err = await assertRejects(
      () => assertEnvironmentAllowed(client(res), "sandbox", "user-1"),
      SandboxForbiddenError,
    );
    assertEquals(err.code, SANDBOX_FORBIDDEN_CODE);
  }
  await assertRejects(
    () => assertEnvironmentAllowed({ rpc: () => Promise.reject(new Error("net")) }, "sandbox", "u"),
    SandboxForbiddenError,
  );
  await assertRejects(
    () => assertEnvironmentAllowed(client({ data: true }), "sandbox", null),
    SandboxForbiddenError,
  );
});

Deno.test("непознат environment не минава като live", async () => {
  await assertRejects(() => assertEnvironmentAllowed(client({ data: true }), "prod", "u"), Error);
  await assertRejects(() => assertEnvironmentAllowed(client({ data: true }), undefined, "u"), Error);
});

Deno.test("isStaffUser е fail-closed", async () => {
  assertEquals(await isStaffUser(client({ data: true }), "u"), true);
  assertEquals(await isStaffUser(client({ data: false }), "u"), false);
  assertEquals(await isStaffUser(client({ data: 1 }), "u"), false);
  assertEquals(await isStaffUser(client({ error: { message: "x" } }), "u"), false);
  assertEquals(await isStaffUser(client({ data: true }), ""), false);
});

Deno.test("extractEventUserId чете само подписаните metadata", () => {
  assertEquals(
    extractEventUserId("checkout.session.completed", { metadata: { userId: "u1" } }),
    "u1",
  );
  // Индивидуален и екипен абонамент — и двата носят metadata.userId.
  assertEquals(
    extractEventUserId("customer.subscription.created", { metadata: { userId: "u2" } }),
    "u2",
  );
  assertEquals(
    extractEventUserId("customer.subscription.deleted", {
      metadata: { userId: "owner", teamId: "t1", kind: "team" },
    }),
    "owner",
  );
  for (const bad of [{}, { metadata: {} }, { metadata: { userId: "" } }, { metadata: { userId: 7 } }, null, undefined]) {
    assertEquals(extractEventUserId("invoice.payment_failed", bad), null);
  }
});

// ---- Статични проверки: всяка функция, която създава Stripe checkout /
// session / subscription, минава през guard-а със JWT user id. ----

const CHECKOUT_FUNCTIONS = [
  "create-checkout",
  "create-strict-unlock-checkout",
  "create-team",
  "team-update-seats",
  "customer-portal",
];

Deno.test("всички Stripe-мутиращи функции ползват sandbox guard", async () => {
  for (const fn of CHECKOUT_FUNCTIONS) {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    assertEquals(src.includes("../_shared/sandbox-guard.ts"), true, fn);
    assertEquals(/await assertEnvironmentAllowed\(/.test(src), true, fn);
    assertEquals(src.includes("sandboxForbiddenResponse(corsHeaders)"), true, fn);
    // Не се доверява на userId от body.
    assertEquals(/assertEnvironmentAllowed\([a-zA-Z]+, environment, (userId|user\.id)\)/.test(src), true, fn);
    assertEquals(/body\.userId|metadata\?\.userId as string/.test(src), false, fn);
  }
});

Deno.test("webhook: sandbox gate преди всеки entitlement write + fail-closed RPC", async () => {
  const src = await Deno.readTextFile(new URL("../payments-webhook/index.ts", import.meta.url));
  assertEquals(src.includes('import { extractEventUserId, isStaffUser } from "../_shared/sandbox-guard.ts";'), true);
  // Gate-ът е в handleWebhook, преди switch-а → покрива checkout.session.completed,
  // customer.subscription.created/updated/deleted и екипните събития.
  const gateIdx = src.indexOf('if (env === "sandbox" && !(await sandboxEntitlementAllowed(');
  const switchIdx = src.indexOf("switch (event.type)");
  assertEquals(gateIdx > 0, true);
  assertEquals(gateIdx < switchIdx, true);
  // Без entitlement write, order snapshot или receipt email при блокиран event.
  for (const marker of ["handleCheckoutCompleted", "order_snapshots", "sendAppEmail", "credit_topup_ops", "download_quota"]) {
    assertEquals(src.indexOf(marker) > 0, true, marker);
  }
  // Ранен `return` вместо throw → 200 ignored, без retry storm.
  assertEquals(/sandboxEntitlementAllowed\([^)]*\)\)\) \{\s*return;/.test(src), true);
  // one-off RPC резултат: само ok === true се приема.
  assertEquals(src.includes('?.ok !== true'), true);
  assertEquals(src.includes('if (ok === false)'), false);
});
