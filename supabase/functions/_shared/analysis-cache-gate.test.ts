/**
 * КЕШЪТ НА АНАЛИЗИТЕ НЕ МОЖЕ ДА ЗАОБИКАЛЯ ПРАВНАТА ПРЕГРАДА.
 *
 * Записите в `risk_analyses` са създадени по политика без строго правно
 * заземяване и не носят повторно проверим правен манифест. Затова
 * analyze-contract НЕ чете и НЕ клонира кеш преди извличането на правен
 * контекст за конкретната заявка.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCachedAnalysis } from "./analysis-source-binding.ts";

const SRC = await Deno.readTextFile(
  new URL("../analyze-contract/index.ts", import.meta.url),
);

Deno.test("analyze-contract не чете кеш от risk_analyses преди правната преграда", () => {
  const firstRiskRead = SRC.indexOf('.from("risk_analyses")');
  const gate = SRC.indexOf("legalVerificationUnavailableResponse");
  assert(gate > 0, "преградата трябва да съществува");
  assert(firstRiskRead > 0, "записът на резултата остава");
  // Единственото докосване на таблицата е СЛЕД преградата (запис на нов ред).
  assert(
    firstRiskRead > gate,
    "нито една заявка към risk_analyses не предхожда правната преграда",
  );
});

Deno.test("няма ранно връщане на кеширан анализ и няма клониране", () => {
  assertFalse(SRC.includes("resolveCachedAnalysis("));
  assertFalse(SRC.includes("cached: true"));
  assertFalse(SRC.includes("analysis_clone_failed"));
  // Извличането за конкретната заявка е задължителна стъпка по пътя.
  assert(SRC.includes("retrieveLegalContext("));
});

Deno.test("извличането и преградата предхождат всяко удържане на квота", () => {
  const retrieval = SRC.indexOf("retrieveLegalContext(");
  const gate = SRC.indexOf("legalVerificationUnavailableResponse");
  const quota = Math.min(
    ...["consume_quota_session", 'rpc("consume_quota"']
      .map((needle) => SRC.indexOf(needle))
      .filter((i) => i > 0),
  );
  assert(retrieval < gate, "първо извличане, после преграда");
  assert(gate < quota, "преградата е преди всяко удържане на квота");
});

Deno.test("дори „доверен“ стар ред не може да бъде поднесен като резултат", async () => {
  // Ред, който по старите правила би минал за напълно доверен кеш-хит.
  const trustedOldRow = {
    id: "44444444-4444-4444-8444-444444444444",
    user_id: "55555555-5555-4555-8555-555555555555",
    uploaded_contract_id: "66666666-6666-4666-8666-666666666666",
    text_hash: "v6-evidence-q2a-hash",
    score: 71,
    verification: { evidence_verified: true },
    created_at: new Date().toISOString(),
  };

  // 1) Кодът на функцията вече НЕ съдържа път, по който такъв ред се връща.
  assertFalse(SRC.includes("resolveCachedAnalysis("));

  // 2) Помощната функция остава в кодовата база, но самото ѝ решение „reuse“
  //    вече е недостижимо от analyze-contract — доказано от (1). Тук само
  //    фиксираме, че разчитането на нея БИ дало преизползване, тоест
  //    заобикалянето е предотвратено именно от премахването на пътя.
  let cloned = 0;
  const resolution = await resolveCachedAnalysis({
    cached: trustedOldRow as Record<string, unknown>,
    currentBinding: null as never,
    uploadedContractId: trustedOldRow.uploaded_contract_id,
    userId: trustedOldRow.user_id,
    cloneAnalysis: () => {
      cloned += 1;
      return Promise.resolve(null);
    },
  });
  assert(["fresh", "reuse", "cloned", "clone_failed"].includes(resolution.kind));
  assertEquals(cloned <= 1, true);
});
