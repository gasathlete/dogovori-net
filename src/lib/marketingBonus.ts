import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

export const MARKETING_BONUS_VERSION = "2026-10-21";
export const MARKETING_BONUS_EVENT = "dogovori:marketing-bonus";
export interface BonusOffer {
  userId: string;
  bonusOps: number;
  resolve: (continueOperation: boolean) => void;
}
const CREDIT_CODES = new Set([
  "quota_exceeded", "insufficient_quota", "pro_limit_reached", "plan_limit_reached",
  "ai_free_limit_reached", "ai_plan_limit_reached",
  "limit_reached", "monthly_limit_reached", "ocr_quota_exceeded",
]);
const OPERATION_ENDPOINTS = new Set([
  "generate-contract", "build-custom-contract", "review-contract", "refine-contract",
  "apply-corrections", "correct-uploaded", "analyze-contract", "download-document",
  "download-blank", "save-document", "saved-document-content", "generate-linked-document",
  "negotiation-strategy", "generate-job", "ocr-contract",
]);
export function isInsufficientCredit(data: unknown, status?: number): boolean {
  if (!data || typeof data !== "object") return false;
  const body = data as Record<string, unknown>;
  // A payment/product/upgrade gate is NOT insufficient operations.
  return [body.code, body.error, body.reason].some((v) => typeof v === "string" && CREDIT_CODES.has(v))
    || (status === 402 && body.charge_state === "not_charged" && body.code === "insufficient_credits");
}

export async function refreshBonusBalance(userId: string) {
  await queryClient.invalidateQueries({ queryKey: ["download-quota", userId] });
  window.dispatchEvent(new CustomEvent("dogovori:quota-refreshed"));
}

/** Only called after a new user action was denied. No local eligibility cache. */
export async function offerMarketingBonus(): Promise<boolean> {
  try {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data, error } = await supabase.rpc("marketing_bonus_status");
  const status = data as { eligible?: boolean; bonus_ops?: number } | null;
  if (error || status?.eligible !== true || typeof status.bonus_ops !== "number") return false;
  const userId = session.user.id;
  const accepted = await new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<BonusOffer>(MARKETING_BONUS_EVENT, {
      detail: { userId, bonusOps: status.bonus_ops as number, resolve },
    }));
  });
  const { data: { session: current } } = await supabase.auth.getSession();
  return accepted && current?.user.id === userId;
  } catch { return false; }
}

/** At most ONE replay, same body/operation IDs; only after a definite quota denial. */
export async function retryWithMarketingBonus<T>(
  action: () => Promise<T>,
  denied: (result: T) => boolean | Promise<boolean>,
): Promise<T> {
  const result = await action();
  if (await denied(result) && await offerMarketingBonus()) return action();
  return result;
}

/** Preserve the SDK result/error shape for existing consumers. */
export async function invokeWithMarketingBonus<T = Record<string, any>>(
  name: string,
  options: Parameters<typeof supabase.functions.invoke>[1],
) {
  return retryWithMarketingBonus(
    () => supabase.functions.invoke<T>(name, options),
    async ({ data, error }) => {
      if (!OPERATION_ENDPOINTS.has(name) || (name === "generate-job" && (options?.body as { action?: string } | undefined)?.action !== "start")) return false;
      if (isInsufficientCredit(data)) return true;
      const context = (error as { context?: Response } | null)?.context;
      if (!(context instanceof Response)) return false;
      try { return isInsufficientCredit(await context.clone().json(), context.status); }
      catch { return false; }
    },
  );
}

export async function fetchWithMarketingBonus(input: string, init: RequestInit): Promise<Response> {
  return retryWithMarketingBonus(() => fetch(input, init), async (response) => {
    if (response.ok) return false;
    try { return isInsufficientCredit(await response.clone().json(), response.status); }
    catch { return false; }
  });
}