/**
 * GATE 2 — ПОВЕДЕНЧЕСКИ тестове за повикването на модела при преговорната
 * стратегия: 1 основен + най-много 1 резервен, НИКОГА трето. Хвърлена грешка
 * (мрежа, бюджет) се предава нагоре, за да стане изравняване.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callStrategyModelWithFallback,
  FALLBACK_MODEL,
  PRIMARY_MODEL,
} from "./model-call.ts";
import {
  type LedgerRpc,
  ProviderCallBudget,
  reconcileUnexpectedFailure,
} from "../_shared/ai-document-ledger.ts";

function ledger(): { db: LedgerRpc; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    db: {
      rpc(name) {
        calls.push(name);
        return Promise.resolve({ data: { status: "reconciliation" }, error: null });
      },
    },
  };
}

const CTX = { operationId: "11111111-2222-4333-8444-555555555555", userId: "u1" };

Deno.test("успешен основен модел = точно едно повикване", async () => {
  const budget = new ProviderCallBudget("negotiation_strategy");
  const used: string[] = [];
  const out = await callStrategyModelWithFallback({
    take: () => budget.take(),
    call: (m) => {
      used.push(m);
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
  });
  assertEquals(used, [PRIMARY_MODEL]);
  assertEquals(out.calls, 1);
  assertEquals(budget.used, 1);
  assertEquals(out.model, PRIMARY_MODEL);
});

Deno.test("429/5xx минава към резервния модел, но никога към трети", async () => {
  for (const status of [429, 500, 503]) {
    const budget = new ProviderCallBudget("negotiation_strategy");
    const used: string[] = [];
    const out = await callStrategyModelWithFallback({
      take: () => budget.take(),
      call: (m) => {
        used.push(m);
        return Promise.resolve(new Response("{}", { status: m === PRIMARY_MODEL ? status : 500 }));
      },
    });
    assertEquals(used, [PRIMARY_MODEL, FALLBACK_MODEL]);
    assertEquals(out.calls, 2);
    assertEquals(budget.used, 2);
    assertEquals(budget.remaining, 0);
  }
});

Deno.test("детерминистична грешка 4xx НЕ отваря резервно повикване", async () => {
  const budget = new ProviderCallBudget("negotiation_strategy");
  const used: string[] = [];
  const out = await callStrategyModelWithFallback({
    take: () => budget.take(),
    call: (m) => {
      used.push(m);
      return Promise.resolve(new Response("{}", { status: 422 }));
    },
  });
  assertEquals(used, [PRIMARY_MODEL]);
  assertEquals(out.calls, 1);
});

Deno.test("хвърлено основно повикване → изравняване, без резервен модел", async () => {
  const budget = new ProviderCallBudget("negotiation_strategy");
  const used: string[] = [];
  const { db, calls } = ledger();
  let resp: Response | null = null;
  try {
    await callStrategyModelWithFallback({
      take: () => budget.take(),
      call: (m) => {
        used.push(m);
        return Promise.reject(new TypeError("error sending request"));
      },
    });
  } catch (e) {
    resp = await reconcileUnexpectedFailure({ db, ...CTX }, {}, e);
  }
  assertEquals(used, [PRIMARY_MODEL]);
  assertEquals(budget.used, 1);
  assert(resp);
  assertEquals(resp!.status, 503);
  assertEquals((await resp!.json()).reason, "provider_uncertainty");
  assertEquals(calls, ["ai_document_operation_mark_reconciliation"]);
});

Deno.test("хвърлено резервно повикване → изравняване след точно 2 повиквания", async () => {
  const budget = new ProviderCallBudget("negotiation_strategy");
  const used: string[] = [];
  const { db, calls } = ledger();
  let resp: Response | null = null;
  try {
    await callStrategyModelWithFallback({
      take: () => budget.take(),
      call: (m) => {
        used.push(m);
        if (m === PRIMARY_MODEL) return Promise.resolve(new Response("", { status: 500 }));
        return Promise.reject(new TypeError("error sending request"));
      },
    });
  } catch (e) {
    resp = await reconcileUnexpectedFailure({ db, ...CTX }, {}, e);
  }
  assertEquals(used, [PRIMARY_MODEL, FALLBACK_MODEL]);
  assertEquals(budget.used, 2);
  assert(resp);
  assertEquals(calls.length, 1);
  assert(!calls.some((c) => c.includes("cancel")), "няма връщане на квота след модела");
});

Deno.test("изчерпан бюджет не допуска трето повикване", async () => {
  const budget = new ProviderCallBudget("negotiation_strategy");
  budget.take();
  budget.take();
  const used: string[] = [];
  let thrown: unknown = null;
  try {
    await callStrategyModelWithFallback({
      take: () => budget.take(),
      call: (m) => {
        used.push(m);
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
    });
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof Error);
  assertEquals(used, []);
  assertEquals(budget.used, 2);
});
