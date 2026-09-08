import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideAssistantOrchestration,
  FREE_AI_MESSAGES,
  runAssistantOrchestration,
  type OrchestrationInput,
} from "./orchestration.ts";

const USER = "user-1";
const OTHER = "user-2";
const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-9222-222222222222";

function baseInput(over: Partial<OrchestrationInput> = {}): OrchestrationInput {
  return {
    userId: USER,
    requestedContext: null,
    existingThread: null,
    resolved: null,
    resolutionFailure: null,
    plan: { teamId: null, isPro: false },
    ...over,
  };
}

/** Инструментиран фалшив достъп: всяко докосване се брои. */
function deps(opts?: {
  quota?: Record<string, unknown> | null;
  updateReturns?: Record<string, unknown> | null;
  rpcOk?: boolean;
}) {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const filters: Array<[string, unknown]> = [];
  const admin = {
    from(table: string) {
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { filters.push([col, val]); return api; },
        lt: (col: string, val: unknown) => { filters.push([`lt:${col}`, val]); return api; },
        upsert: (row: Record<string, unknown>) => {
          calls.push(`${table}.upsert`);
          updates.push(row);
          return Promise.resolve({ data: null, error: null });
        },
        insert: () => { calls.push(`${table}.insert`); return api; },
        update: (row: Record<string, unknown>) => {
          calls.push(`${table}.update`);
          updates.push(row);
          return api;
        },
        maybeSingle: async () => {
          if (calls[calls.length - 1] === `${table}.update`) {
            const has = !!opts && Object.prototype.hasOwnProperty.call(opts, "updateReturns");
            return { data: has ? opts!.updateReturns : { ai_messages_used: 1 }, error: null };
          }
          calls.push(`${table}.select`);
          return { data: opts?.quota ?? null, error: null };
        },
      };
      return api;
    },
  };
  const userClient = {
    rpc: (fn: string) => {
      calls.push(`rpc:${fn}`);
      return Promise.resolve({ data: { ok: opts?.rpcOk ?? true }, error: null });
    },
  };
  return { admin, userClient, userId: USER, teamId: null as string | null, calls, updates, filters };
}

const okEffects = () => {
  const seen: string[] = [];
  return {
    seen,
    ensureThread: async () => { seen.push("thread"); return "thread-1"; },
    persistUserMessage: async () => { seen.push("message"); return true; },
  };
};

// --- Чисто решение ---------------------------------------------------------

Deno.test("невалиден контекст → отказ без резервация", async () => {
  const d = deps();
  const e = okEffects();
  const r = await runAssistantOrchestration(
    baseInput({ requestedContext: "invalid" }),
    d,
    e,
  );
  assertEquals(r.ok, false);
  assertEquals((r as { code: string }).code, "invalid_document_context");
  assertEquals(d.calls, []);
  assertEquals(e.seen, []);
});

Deno.test("липсващ разговор → 404 без резервация", async () => {
  const d = deps();
  const e = okEffects();
  const r = await runAssistantOrchestration(baseInput({ existingThread: "not_found" }), d, e);
  assertEquals((r as { code: string }).code, "thread_not_found");
  assertEquals(d.calls, []);
  assertEquals(e.seen, []);
});

Deno.test("чужд разговор → 404 без резервация", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({
      existingThread: { userId: OTHER, contextKind: null, contextEntityId: null, contextVersion: null },
    }),
    d,
    okEffects(),
  );
  assertEquals((r as { code: string }).code, "thread_not_found");
  assertEquals(d.calls, []);
});

Deno.test("несъвпадащ контекст → 409 без резервация", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({
      requestedContext: { kind: "saved_document", entityId: UUID },
      resolved: { version: "v1" },
      existingThread: {
        userId: USER, contextKind: "saved_document", contextEntityId: UUID2, contextVersion: "v1",
      },
    }),
    d,
    okEffects(),
  );
  assertEquals((r as { code: string }).code, "document_context_mismatch");
  assertEquals(d.calls, []);
});

Deno.test("обвързан разговор не може да стане общ", () => {
  const r = decideAssistantOrchestration(
    baseInput({
      requestedContext: null,
      existingThread: {
        userId: USER, contextKind: "analysis", contextEntityId: UUID, contextVersion: "v1",
      },
    }),
  );
  assertEquals((r as { code: string }).code, "document_context_mismatch");
});

Deno.test("липсващ документ → 404 без резервация", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({
      requestedContext: { kind: "saved_document", entityId: UUID },
      resolutionFailure: "document_not_found",
    }),
    d,
    okEffects(),
  );
  assertEquals((r as { code: string }).code, "document_not_found");
  assertEquals(d.calls, []);
});

Deno.test("остаряла версия на обвързания документ → 409 без резервация", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({
      requestedContext: { kind: "saved_document", entityId: UUID },
      resolved: { version: "v2" },
      existingThread: {
        userId: USER, contextKind: "saved_document", contextEntityId: UUID, contextVersion: "v1",
      },
    }),
    d,
    okEffects(),
  );
  assertEquals((r as { code: string }).code, "document_context_stale");
  assertEquals(d.calls, []);
});

Deno.test("остарял анализ → analysis_context_stale без резервация", async () => {
  const d = deps();
  const e = okEffects();
  const r = await runAssistantOrchestration(
    baseInput({
      requestedContext: { kind: "analysis", entityId: UUID },
      resolutionFailure: "analysis_context_stale",
    }),
    d,
    e,
  );
  assertEquals((r as { code: string }).code, "analysis_context_stale");
  assertEquals((r as { status: number }).status, 409);
  assertEquals(d.calls, []);
  assertEquals(e.seen, []);
});

// --- Приети пътища: ТОЧНО ЕДНА резервация ---------------------------------

Deno.test("екипен път: consume_team_quota точно веднъж", async () => {
  const d = deps();
  d.teamId = "team-1";
  const r = await runAssistantOrchestration(
    baseInput({ plan: { teamId: "team-1", isPro: false } }),
    d,
    okEffects(),
  );
  assert(r.ok);
  assertEquals(d.calls.filter((c) => c.startsWith("rpc:")), ["rpc:consume_team_quota"]);
});

Deno.test("платен път: consume_ai_message точно веднъж", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({ plan: { teamId: null, isPro: true } }),
    d,
    okEffects(),
  );
  assert(r.ok);
  assertEquals(d.calls.filter((c) => c.startsWith("rpc:")), ["rpc:consume_ai_message"]);
});

Deno.test("безплатен път вдига трите брояча точно по веднъж", async () => {
  const d = deps({
    quota: { ai_messages_used: 1, monthly_total_used: 4, total_used: 9 },
    updateReturns: { ai_messages_used: 2 },
  });
  const r = await runAssistantOrchestration(baseInput(), d, okEffects());
  assert(r.ok);
  assertEquals(r.path, "free");
  assertEquals(d.calls.filter((c) => c.startsWith("rpc:")), []);
  assertEquals(d.calls.filter((c) => c === "download_quota.update").length, 1);
  assertEquals(d.updates[0], {
    ai_messages_used: 2,
    monthly_total_used: 5,
    total_used: 10,
  });
  // Атомарност: compare-and-update по всички три прочетени стойности + таван.
  assert(d.filters.some(([c, v]) => c === "ai_messages_used" && v === 1));
  assert(d.filters.some(([c, v]) => c === "monthly_total_used" && v === 4));
  assert(d.filters.some(([c, v]) => c === "total_used" && v === 9));
  assert(d.filters.some(([c, v]) => c === "lt:ai_messages_used" && v === FREE_AI_MESSAGES));
});

Deno.test("безплатният таван остава 3 и не се заобикаля при отказ", async () => {
  const d = deps({
    quota: { ai_messages_used: 3, monthly_total_used: 3, total_used: 3 },
    updateReturns: null,
  });
  const r = await runAssistantOrchestration(baseInput(), d, okEffects());
  assertEquals((r as { code: string }).code, "ai_free_limit_reached");
  assertEquals((r as { status: number }).status, 402);
  assertEquals(FREE_AI_MESSAGES, 3);
});

// --- Ред на записа и контролирани провали ---------------------------------

Deno.test("провален запис на разговора → 503 без резервация и без AI", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(baseInput(), d, {
    ensureThread: async () => null,
    persistUserMessage: async () => true,
  });
  assertEquals((r as { code: string }).code, "thread_unavailable");
  assertEquals((r as { status: number }).status, 503);
  assertEquals(d.calls, []);
});

Deno.test("провален запис на съобщението → 503 без резервация", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(baseInput(), d, {
    ensureThread: async () => "thread-1",
    persistUserMessage: async () => false,
  });
  assertEquals((r as { code: string }).code, "message_persist_failed");
  assertEquals((r as { status: number }).status, 503);
  assertEquals(d.calls, []);
});

Deno.test("редът е: валидация → запис → резервация", async () => {
  const order: string[] = [];
  const d = deps();
  const wrapped = {
    ...d,
    userClient: {
      rpc: (fn: string) => { order.push(`rpc:${fn}`); return Promise.resolve({ data: { ok: true }, error: null }); },
    },
  };
  const r = await runAssistantOrchestration(
    baseInput({ plan: { teamId: null, isPro: true } }),
    wrapped,
    {
      ensureThread: async () => { order.push("thread"); return "t"; },
      persistUserMessage: async () => { order.push("message"); return true; },
    },
  );
  assert(r.ok);
  assertEquals(order, ["thread", "message", "rpc:consume_ai_message"]);
});

Deno.test("приет разговор връща ID-то на разговора", async () => {
  const d = deps();
  const r = await runAssistantOrchestration(
    baseInput({ plan: { teamId: null, isPro: true } }),
    d,
    okEffects(),
  );
  assert(r.ok);
  assertEquals(r.threadId, "thread-1");
});
