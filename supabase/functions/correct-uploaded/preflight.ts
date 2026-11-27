/**
 * Q2b2 — ЕДИНСТВЕНАТА проверка преди всякакъв AI/RAG/запис на употреба.
 *
 * Функцията е инжектируема: четенето на редовете и изчисляването на отпечатъка
 * се подават отвън, за да може реалният ред на проверките да се тества без
 * мрежа и без модел. Обработващият Deno.serve използва точно тази функция.
 */

import { validateAnalysisVerification } from "../_shared/analysis-evidence.ts";
import {
  buildAnalysisSourceBinding,
  buildTitleContext,
  isSourceBindingEqual,
  readSourceBinding,
  type AnalysisSourceBinding,
} from "../_shared/analysis-source-binding.ts";
import {
  CORRECTION_MAX_SOURCE_CHARS,
  parseCorrectionRequest,
  selectFindings,
  type CorrectionRequest,
  type SelectedIssue,
  type SelectedMissing,
} from "./request.ts";

export interface ContractRow {
  id: string;
  user_id: string;
  title: string | null;
  extracted_text: string | null;
}

export interface AnalysisRow {
  id: string;
  user_id: string | null;
  uploaded_contract_id: string | null;
  contract_type?: string | null;
  summary?: string | null;
  issues?: unknown;
  missing_clauses?: unknown;
  verification?: unknown;
}

export interface CorrectionPreflightError {
  status: 400 | 403 | 404 | 409 | 413;
  code: string;
  message: string;
}

export interface CorrectionPreflightOk {
  ok: true;
  request: CorrectionRequest;
  contract: ContractRow;
  analysis: AnalysisRow;
  /** Точният пълен източник (trim), върху който работим. */
  sourceText: string;
  currentBinding: AnalysisSourceBinding;
  issues: SelectedIssue[];
  missing: SelectedMissing[];
}

export interface CorrectionPreflightDeps {
  loadContract(id: string): Promise<ContractRow | null>;
  loadAnalysis(id: string): Promise<AnalysisRow | null>;
  computeBinding?(input: { sourceText: string; titleContext: string }): Promise<AnalysisSourceBinding>;
}

const NOT_FOUND: CorrectionPreflightError = {
  status: 404,
  code: "not_found",
  message: "Документът не е намерен.",
};

export async function runCorrectionPreflight(input: {
  userId: string;
  body: unknown;
  deps: CorrectionPreflightDeps;
}): Promise<CorrectionPreflightOk | { ok: false; error: CorrectionPreflightError }> {
  const parsed = parseCorrectionRequest(input.body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const request = parsed.value;

  const contract = await input.deps.loadContract(request.uploadedContractId);
  if (!contract || contract.user_id !== input.userId) return { ok: false, error: NOT_FOUND };

  // ТОЧНО указаният анализ — не „последният" — и той трябва да е на този
  // документ и на този потребител.
  const analysis = await input.deps.loadAnalysis(request.analysisId);
  if (
    !analysis || analysis.user_id !== input.userId ||
    analysis.uploaded_contract_id !== request.uploadedContractId
  ) {
    return {
      ok: false,
      error: { status: 404, code: "analysis_not_found", message: "Анализът не е намерен." },
    };
  }

  // Доказателствените метаданни трябва да са СТРИКТНО валидни (Q2a).
  const evidence = validateAnalysisVerification(analysis.verification);
  if (!evidence) {
    return {
      ok: false,
      error: {
        status: 409,
        code: "analysis_verification_invalid",
        message: "Този анализ не носи валиден запис на проверката. Направете нов анализ.",
      },
    };
  }
  if (evidence.reason_codes.includes("input_truncated")) {
    return {
      ok: false,
      error: {
        status: 409,
        code: "input_truncated",
        message:
          "Анализът е правен върху съкратен текст, затова не можем да пренапишем целия документ.",
      },
    };
  }

  const sourceText = String(contract.extracted_text ?? "").trim();
  const compute = input.deps.computeBinding ?? buildAnalysisSourceBinding;
  const currentBinding = await compute({
    sourceText,
    titleContext: buildTitleContext(contract.title),
  });

  const storedBinding = readSourceBinding(analysis.verification);
  if (!storedBinding || !isSourceBindingEqual(storedBinding, currentBinding)) {
    return {
      ok: false,
      error: {
        status: 409,
        code: "source_binding_mismatch",
        message: "Анализът не се отнася за текущия текст на документа. Направете нов анализ.",
      },
    };
  }
  if (!isSourceBindingEqual(request.expectedSourceBinding, currentBinding)) {
    return {
      ok: false,
      error: {
        status: 409,
        code: "source_binding_mismatch",
        message: "Документът е променен, откакто беше отворен. Презаредете и опитайте пак.",
      },
    };
  }

  // Твърде дълъг източник: не връщаме частично пренаписан документ.
  if (sourceText.length > CORRECTION_MAX_SOURCE_CHARS) {
    return {
      ok: false,
      error: {
        status: 413,
        code: "source_too_long",
        message:
          `Документът е по-дълъг от ${CORRECTION_MAX_SOURCE_CHARS} знака и не може да бъде пренаписан цялостно.`,
      },
    };
  }

  const selected = selectFindings({
    issues: analysis.issues,
    missingClauses: analysis.missing_clauses,
    issueIndices: request.selectedIssueIndices,
    missingIndices: request.selectedMissingIndices,
    sourceText,
  });
  if (!selected.ok) return { ok: false, error: selected.error };

  return {
    ok: true,
    request,
    contract,
    analysis,
    sourceText,
    currentBinding,
    issues: selected.issues,
    missing: selected.missing,
  };
}
