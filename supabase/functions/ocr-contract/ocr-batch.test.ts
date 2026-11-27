/**
 * GATE 2 — ПОВЕДЕНЧЕСКИ тестове за целостта на OCR партидата.
 * Провалена страница прави ЦЯЛАТА партида несигурна: няма потвърждаване, няма
 * частичен текст, няма връщане на квота и няма второ повикване.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OcrBatchFailure, requireOcrPageContent, runOcrBatch } from "./ocr-batch.ts";
import {
  commitDocumentOperation,
  type LedgerRpc,
  ProviderCallBudget,
  reconcileUnexpectedFailure,
} from "../_shared/ai-document-ledger.ts";

function fakeLedger(): { db: LedgerRpc; calls: string[] } {
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

Deno.test("успешна партида връща всички страници по ред", async () => {
  const budget = new ProviderCallBudget("ocr_contract");
  const out = await runOcrBatch({
    pageCount: 5,
    concurrency: 3,
    readPage: (i) => {
      budget.take();
      return Promise.resolve(`страница ${i}`);
    },
  });
  assertEquals(out, ["страница 0", "страница 1", "страница 2", "страница 3", "страница 4"]);
  assertEquals(budget.used, 5);
});

Deno.test("[OCR_UNREADABLE] е валиден резултат и не проваля партидата", async () => {
  const out = await runOcrBatch({
    pageCount: 2,
    concurrency: 1,
    readPage: (i) => Promise.resolve(i === 0 ? "[OCR_UNREADABLE]" : "текст"),
  });
  assertEquals(out, ["[OCR_UNREADABLE]", "текст"]);
});

Deno.test("една провалена страница проваля цялата партида и спира останалите", async () => {
  const read: number[] = [];
  let thrown: unknown = null;
  try {
    await runOcrBatch({
      pageCount: 8,
      concurrency: 1,
      readPage: (i) => {
        read.push(i);
        if (i === 2) return Promise.reject(new Error("ocr_provider_http_500"));
        return Promise.resolve(`страница ${i}`);
      },
    });
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof OcrBatchFailure, "партидата трябва да се провали");
  assertEquals((thrown as OcrBatchFailure).pageIndex, 2);
  // Следващите страници НЕ се четат — не се харчи бюджет напразно.
  assertEquals(read, [0, 1, 2]);
});

Deno.test("провалена страница → изравняване, без потвърждаване и без частичен текст", async () => {
  const { db, calls } = fakeLedger();
  const budget = new ProviderCallBudget("ocr_contract");
  let response: Response | null = null;
  try {
    const out = await runOcrBatch({
      pageCount: 4,
      concurrency: 2,
      readPage: (i) => {
        budget.take();
        if (i === 1) throw new Error("ocr_page_content_empty");
        return Promise.resolve(`страница ${i}`);
      },
    });
    // Потвърждаване има САМО при пълна партида — тук не се достига.
    await commitDocumentOperation(db, {
      operationId: "11111111-2222-4333-8444-555555555555",
      userId: "u1",
      purpose: "ocr_contract",
      binding: "a".repeat(64),
      result: { text: out.join("\n") },
      usageFunction: "ocr-contract",
    });
  } catch (e) {
    response = await reconcileUnexpectedFailure(
      { db, operationId: "11111111-2222-4333-8444-555555555555", userId: "u1" },
      {},
      e,
    );
  }
  assert(response, "трябва да се върне отговор за изравняване");
  assertEquals(response!.status, 503);
  assertEquals(calls, ["ai_document_operation_mark_reconciliation"]);
  assert(!calls.includes("ai_document_operation_commit"), "няма частично потвърждаване");
  assert(!calls.some((c) => c.includes("cancel")), "няма връщане на квота след модела");
  assert(budget.used <= budget.max, "бюджетът не се надхвърля");
});

Deno.test("празно или липсващо съдържание не е успех", () => {
  assertEquals(requireOcrPageContent("  текст  "), "текст");
  for (const bad of [undefined, null, 42, "", "   "]) {
    let threw = false;
    try {
      requireOcrPageContent(bad);
    } catch {
      threw = true;
    }
    assert(threw, `празното съдържание ${JSON.stringify(bad)} трябва да проваля страницата`);
  }
});

Deno.test("изчерпан бюджет проваля партидата, без 13-то повикване", async () => {
  const budget = new ProviderCallBudget("ocr_contract");
  let calls = 0;
  let thrown: unknown = null;
  try {
    await runOcrBatch({
      pageCount: 20,
      concurrency: 1,
      readPage: () => {
        budget.take();
        calls++;
        return Promise.resolve("текст");
      },
    });
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof OcrBatchFailure);
  assertEquals(calls, 12);
  assertEquals(budget.used, 12);
});
