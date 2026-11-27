/**
 * Q2b2 (security addendum) — ЕДИННА редакция на ЦЕЛИЯ изходящ контекст за
 * корекцията.
 *
 * Проблемът, който това решава: досега само текстът на документа минаваше през
 * `redactForAI`, а резюмето, типът и текстовете на избраните находки (включително
 * новото поле `clause`) влизаха в промпта и в заявката към RAG СУРОВИ. Един и същ
 * e-mail можеше да бъде маскиран в документа и същевременно изпратен в чист вид
 * през резюмето.
 *
 * Решение: всички изходящи полета се редактират ЗАЕДНО, с ЕДИН общ мапинг, за да
 * няма нито рестартиращи се броячи, нито колизии на плейсхолдъри. Мапингът живее
 * само в паметта на заявката — не се логва и не се записва.
 *
 * Важно: обвързването с източника и проверката на цитатите се случват в
 * `preflight.ts` върху ТОЧНИЯ суров текст — ПРЕДИ тази редакция. Тук не се
 * променят никакви записи.
 */

import { redactForAI, type RedactionMapping } from "../_shared/redact.ts";
import type { SelectedIssue, SelectedMissing } from "./request.ts";

/** Разделител между полетата в общия корпус. Съдържа символ, който не участва
 * в никой от PII шаблоните, така че не може да се образува „име" през граница. */
const FIELD_SEP = "\n\u241E\u241E\u241E\n";

export interface CorrectionContext {
  /** Пълният източник (trim) — точно текстът, върху който е обвързан анализът. */
  sourceText: string;
  contractType: string;
  summary: string;
  issues: SelectedIssue[];
  missing: SelectedMissing[];
}

export interface RedactedCorrectionContext {
  ok: true;
  redactionApplied: boolean;
  context: CorrectionContext;
  /** placeholder -> оригинална стойност. Никога не се логва и не се записва. */
  mapping: RedactionMapping;
}

export interface CorrectionRedactionError {
  ok: false;
  code: "context_not_redactable";
  message: string;
}

function isText(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Проверява, че контекстът е редактируем. Fail-closed: при неочакван тип или при
 * наличие на служебния разделител в данните не се изпраща нищо към модела.
 */
function collectFields(ctx: CorrectionContext): string[] | null {
  if (!ctx || typeof ctx !== "object") return null;
  if (!Array.isArray(ctx.issues) || !Array.isArray(ctx.missing)) return null;
  const fields: string[] = [];
  const push = (v: unknown): boolean => {
    if (!isText(v)) return false;
    if (v.includes("\u241E")) return false;
    fields.push(v);
    return true;
  };
  if (!push(ctx.sourceText) || !push(ctx.contractType) || !push(ctx.summary)) return null;
  for (const i of ctx.issues) {
    if (!i || typeof i !== "object") return null;
    if (!push(i.title) || !push(i.clause) || !push(i.explanation)) return null;
    if (!push(i.suggestion ?? "")) return null;
  }
  for (const m of ctx.missing) {
    if (!m || typeof m !== "object") return null;
    if (!push(m.name) || !push(m.why)) return null;
  }
  return fields;
}

/**
 * Общият текст, върху който се прави класификацията. Класифицира се документът
 * ЗАЕДНО със запазените находки/резюме, защото и те излизат навън.
 */
export function buildClassificationCorpus(ctx: CorrectionContext): string {
  const fields = collectFields(ctx);
  if (!fields) return String(ctx?.sourceText ?? "");
  return fields.join("\n");
}

/**
 * Редактира ЕДНОВРЕМЕННО целия изходящ контекст с общ мапинг.
 * Когато `redactionRequired` е false, контекстът се връща непроменен с празен мапинг.
 */
export function redactCorrectionContext(
  ctx: CorrectionContext,
  opts: { redactionRequired: boolean },
): RedactedCorrectionContext | CorrectionRedactionError {
  const fields = collectFields(ctx);
  if (!fields) {
    return {
      ok: false,
      code: "context_not_redactable",
      message: "Контекстът за корекция не може да бъде обработен безопасно. Направете нов анализ.",
    };
  }

  if (!opts.redactionRequired) {
    return {
      ok: true,
      redactionApplied: false,
      context: {
        sourceText: ctx.sourceText,
        contractType: ctx.contractType,
        summary: ctx.summary,
        issues: ctx.issues.map((i) => ({ ...i })),
        missing: ctx.missing.map((m) => ({ ...m })),
      },
      mapping: {},
    };
  }

  const { redacted, mapping } = redactForAI(fields.join(FIELD_SEP));
  const parts = redacted.split(FIELD_SEP);
  if (parts.length !== fields.length) {
    // Редакцията е нарушила границите на полетата — не изпращаме нищо.
    return {
      ok: false,
      code: "context_not_redactable",
      message: "Контекстът за корекция не може да бъде обработен безопасно. Направете нов анализ.",
    };
  }

  let k = 0;
  const next = () => parts[k++];
  const sourceText = next();
  const contractType = next();
  const summary = next();
  const issues: SelectedIssue[] = ctx.issues.map((i) => {
    const title = next();
    const clause = next();
    const explanation = next();
    const suggestion = next();
    const out: SelectedIssue = { severity: i.severity, title, clause, explanation };
    if (i.suggestion !== undefined) out.suggestion = suggestion;
    return out;
  });
  const missing: SelectedMissing[] = ctx.missing.map(() => ({ name: next(), why: next() }));

  return {
    ok: true,
    redactionApplied: true,
    context: { sourceText, contractType, summary, issues, missing },
    mapping,
  };
}
