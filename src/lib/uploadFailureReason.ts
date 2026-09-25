import { normalizeReason, type FunnelReasonCode } from "@/lib/docFunnel";
import { RestrictedIdentifierError } from "@/lib/privacyGate";

/** Грешка с изрично безопасен код — съобщението се показва, но не се отчита. */
export class UploadStepError extends Error {
  readonly code: FunnelReasonCode;
  constructor(code: FunnelReasonCode, message: string) {
    super(message);
    this.name = "UploadStepError";
    this.code = code;
  }
}

/** Код за аналитиката; никога текст от съобщението. */
export function uploadFailureReason(e: unknown): FunnelReasonCode {
  if (e instanceof UploadStepError) return e.code;
  if (e instanceof RestrictedIdentifierError) return "restricted_identifiers";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const n = normalizeReason(msg);
  // Само технически класификации; всичко друго — "unknown".
  return n;
}
