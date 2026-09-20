/**
 * GATE 2 — ПОВЕДЕНЧЕСКИ тестове за fail-closed обработката на НЕОЧАКВАНИ
 * изключения: след трайното начало на модела винаги изравняване (без връщане
 * на квота и без ново повикване), преди него — отмяна с възстановяване.
 * Без мрежа и без база: леджърът е заместен с броящ двойник.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cancelUnexpectedFailure,
  type LedgerRpc,
  normalizeFailureReason,
  type PostModelContext,
  ProviderCallBudget,
  reconcileUnexpectedFailure,
} from "./ai-document-ledger.ts";

interface Call {
  name: string;
  params: Record<string, unknown>;
}

function fakeLedger(opts: { fail?: boolean } = {}): { db: LedgerRpc; calls: Call[] } {
  const calls: Call[] = [];
  const db: LedgerRpc = {
    rpc(name, params) {
      calls.push({ name, params });
      if (opts.fail) return Promise.resolve({ data: null, error: { message: "boom" } });
      return Promise.resolve({ data: { status: "reconciliation", reason: "recorded" }, error: null });
    },
  };
  return { db, calls };
}

function ctx(db: LedgerRpc): PostModelContext {
  return { db, operationId: "11111111-2222-4333-8444-555555555555", userId: "user-1" };
}

const HEADERS = { "x-correlation-id": "cid-1" };

Deno.test("неочаквано изключение след модела → точно едно изравняване, без отмяна", async () => {
  const { db, calls } = fakeLedger();
  const resp = await reconcileUnexpectedFailure(ctx(db), HEADERS, new Error("нещо се счупи"));
  assertEquals(resp.status, 503);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "ai_document_operation_mark_reconciliation");
  assert(!calls.some((c) => c.name.includes("cancel")), "няма автоматично връщане на квота");
  assert(!calls.some((c) => c.name.includes("commit")), "няма потвърждаване на резултат");
  const body = await resp.json();
  assertEquals(body.charge_state, "unresolved");
  // Нормализирана причина, НИКОГА съобщението на грешката.
  assertEquals(body.reason, "unexpected_post_model_error");
  assert(!JSON.stringify(body).includes("нещо се счупи"));
});

Deno.test("провалено изравняване не чупи отговора", async () => {
  const { db, calls } = fakeLedger({ fail: true });
  const resp = await reconcileUnexpectedFailure(ctx(db), HEADERS, new SyntaxError("bad json"));
  assertEquals(resp.status, 503);
  assertEquals(calls.length, 1);
  assertEquals((await resp.json()).reason, "malformed_response");
});

Deno.test("изключение ПРЕДИ модела с резервация → отмяна и нормализирана грешка", async () => {
  const { db, calls } = fakeLedger();
  const resp = await cancelUnexpectedFailure(ctx(db), HEADERS, new Error("x"), "cid-1");
  assertEquals(resp.status, 500);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "ai_document_operation_cancel");
  const body = await resp.json();
  assertEquals(body.code, "internal_error");
  assertEquals(body.correlation_id, "cid-1");
  assert(!JSON.stringify(body).includes("x\""), "суровото съобщение не се връща");
});

Deno.test("нормализираните причини не съдържат съобщения", () => {
  assertEquals(normalizeFailureReason(new SyntaxError("Unexpected token ЕГН")), "malformed_response");
  assertEquals(normalizeFailureReason(new TypeError("fetch failed 10.0.0.1")), "provider_uncertainty");
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assertEquals(normalizeFailureReason(abort), "provider_timeout");
  assertEquals(
    normalizeFailureReason(new Error("provider_call_budget_exceeded:ocr_contract:12")),
    "provider_call_budget_exceeded",
  );
  assertEquals(normalizeFailureReason("ЕГН 8001010000"), "unexpected_error");
  assertEquals(normalizeFailureReason(new Error("текст на договора")), "unexpected_error");
});

Deno.test("изчерпан бюджет се изравнява, без ново повикване към доставчик", async () => {
  const budget = new ProviderCallBudget("generate_linked_document");
  budget.take();
  let thrown: unknown = null;
  try {
    budget.take();
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof Error);
  const { db, calls } = fakeLedger();
  const resp = await reconcileUnexpectedFailure(ctx(db), HEADERS, thrown);
  assertEquals(resp.status, 503);
  assertEquals((await resp.json()).reason, "provider_call_budget_exceeded");
  assertEquals(calls.length, 1);
  assertEquals(budget.used, 1);
});
