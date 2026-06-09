// Helpers for the GDPR/AI Act compliance flow.
// Edge functions return:
//   422 + code "special_category_blocked" / "special_category_data_blocked_for_operation"
//        → operation cannot proceed; show explanation.
//   428 + code "sensitive_data_confirmation_required"
//        → require explicit user acknowledgement before proceeding.
import type { FunctionsHttpError } from "@supabase/supabase-js";

export interface ClassificationSummary {
  risk_level: "low" | "medium" | "high" | "blocked";
  contains_personal_data?: boolean;
  contains_special_category_data?: boolean;
  pii_counts?: Record<string, number>;
  reasons?: string[];
}

export interface SensitiveResponse {
  code?: string;
  error?: string;
  classification?: ClassificationSummary;
}

/**
 * Extract a structured response from a Supabase FunctionsHttpError or a plain
 * object returned in `data` when the function returned non-2xx with body.
 */
export async function parseSensitiveResponse(
  err: unknown,
  data: unknown,
): Promise<SensitiveResponse | null> {
  // Path 1: data already contains an `error` field (function returned 200 with error).
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    return data as SensitiveResponse;
  }
  // Path 2: FunctionsHttpError — read context.body
  const fnErr = err as FunctionsHttpError | undefined;
  const ctx = (fnErr as unknown as { context?: Response }) ?.context;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      const text = await (ctx as Response).clone().text();
      if (text) return JSON.parse(text) as SensitiveResponse;
    } catch {
      return null;
    }
  }
  return null;
}

export function isConfirmationRequired(r: SensitiveResponse | null): boolean {
  return !!r && r.code === "sensitive_data_confirmation_required";
}

export function isSpecialCategoryBlocked(r: SensitiveResponse | null): boolean {
  return (
    !!r &&
    (r.code === "special_category_blocked" ||
      r.code === "special_category_data_blocked_for_operation")
  );
}
