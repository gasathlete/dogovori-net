/**
 * GATE 3 — платеният износ е обвързан със сървърно състояние, не с браузъра.
 *
 * Мрежово тих тест върху източника: платеният резултат идва от сървъра по
 * право на притежателя, а файловете се изграждат от вече заредения резултат.
 * Функцията `download-document` остава само за безплатните пътища.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const productResult = read("src/pages/ProductResult.tsx");
const resultState = read("src/lib/productResultApi.ts");
const downloadLib = read("src/lib/downloadDocument.ts");
const downloadFn = read("supabase/functions/download-document/index.ts");

describe("платен износ", () => {
  it("не минава през download-document", () => {
    expect(productResult).not.toContain("download-document");
    expect(productResult).not.toContain("downloadDocument");
    expect(resultState).not.toContain("download-document");
  });

  it("чете готовото платено състояние от сървъра по право на притежателя", () => {
    expect(productResult).toContain("fetchProductResultState");
    expect(resultState).toContain('invokeEdgeFunction<ProductResultStateResponse>');
    // Браузърът подава само самоличност; резултатът и подписът му идват обратно
    // от сървъра, не се изпращат натам.
    const bodies = resultState.match(/body:\s*\{[^}]*\}/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(/result_payload|payload:|corrected_text/);
    }
  });

  it("файловете се изграждат от заредения резултат, не от подадени данни", () => {
    for (const builder of ["buildReviewReportPdf(result)", "manifest.corrected_text"]) {
      expect(productResult).toContain(builder);
    }
  });

  it("download-document отказва платена самоличност", () => {
    expect(downloadFn).toContain("paid_result_not_exportable");
    for (const key of ["entitlement_id", "result_digest", "product_id"]) {
      expect(downloadFn).not.toContain(`"${key}"`);
    }
  });

  it("клиентската обвивка не изпраща платени полета", () => {
    for (const key of ["entitlement_id", "result_digest", "product_id"]) {
      expect(downloadLib).not.toContain(key);
    }
  });
});
