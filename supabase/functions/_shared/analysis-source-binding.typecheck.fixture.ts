// Q2b1 — фокусиран типов договор (compile-time only).
//
// Целта: `deno check` да инстанцира ИСТИНСКИЯ подател — типизираният изход на
// `runAnalysisEvidencePipeline` се подава ДИРЕКТНО на `buildFreshAnalysisPayload`
// без `any`, `unknown` или `Record` приведения. Ако типовете се разминат, тази
// фикстура пада с TS2322 (пълната проверка на входната точка е блокирана от
// частния пакет за имейли, затова договорът се проверява тук).
//
// Файлът не се изпълнява в продукция и не прави мрежови/базови извиквания.

import { runAnalysisEvidencePipeline } from "./analysis-evidence.ts";
import {
  buildAnalysisSourceBinding,
  buildFreshAnalysisPayload,
  buildTitleContext,
  computeAnalysisCacheKey,
} from "./analysis-source-binding.ts";

export async function assertFreshPayloadTypeContract(): Promise<Record<string, unknown>> {
  const sourceText = "Наемателят не дължи неустойка при забава на плащането.";
  const titleContext = buildTitleContext("Договор за наем");

  const binding = await buildAnalysisSourceBinding({ sourceText, titleContext });
  const cacheKey = await computeAnalysisCacheKey({ promptVersion: "v6", binding });

  const pipeline = runAnalysisEvidencePipeline({
    parsed: {
      contract_type: "Договор за наем",
      score: 7,
      summary: "Резюме.",
      issues: [],
      missing_clauses: [],
    },
    evidenceSource: sourceText,
    truncated: false,
    unredactText: (s: string) => s,
    isClauseActuallyMissing: () => true,
  });

  // Директно подаване на типизирания изход — без приведения.
  return buildFreshAnalysisPayload({
    uploadedContractId: "doc-1",
    userId: "user-1",
    model: "google/gemini-2.5-flash",
    score: pipeline.score,
    contractType: pipeline.contractType,
    summary: pipeline.summary,
    issues: pipeline.issues,
    missingClauses: pipeline.missingClauses,
    cacheKey,
    verification: pipeline.verification,
    binding,
  });
}
