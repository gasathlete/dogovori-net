/**
 * Обръщения към сървърните функции за платения резултат.
 *
 * Браузърът НЕ решава нищо: изпраща точния достъп, точната очаквана версия и
 * точния ключ за повторяемост, а сървърът проверява всичко наново.
 */
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { productBlockedMessage } from "@/lib/productTrustedSource";
import type { CorrectionDecision } from "../../supabase/functions/_shared/product-selections";

export type ResultStateAccess =
  | { readonly mode: "checkout_return"; readonly entitlementId: string; readonly sessionId: string }
  | { readonly mode: "owner"; readonly entitlementId: string };

function accessBody(access: ResultStateAccess): Record<string, unknown> {
  return access.mode === "checkout_return"
    ? { access: "checkout_return", entitlement_id: access.entitlementId, session_id: access.sessionId }
    : { access: "owner", entitlement_id: access.entitlementId };
}

export interface RefinementState {
  readonly included: number;
  readonly used: number;
  readonly current: { readonly status?: string; readonly version?: number } | null;
}

export interface ProductResultStateResponse {
  readonly status: "ready";
  readonly product_id: string;
  readonly result_digest: string;
  readonly selection_version: number;
  readonly decisions: readonly CorrectionDecision[];
  readonly patch_output_hash: string | null;
  readonly corrections_count: number;
  readonly refinement: RefinementState | null;
}

export interface SavedSelectionResponse {
  readonly status: "saved";
  readonly replay: boolean;
  readonly selection_version: number;
  readonly result_digest: string;
  readonly applied_count: number;
  readonly rejected_count: number;
  readonly output_hash: string;
  readonly output_char_count: number;
  readonly corrected_text: string;
}

export interface ApiFailure {
  readonly error: string;
  readonly message: string;
  readonly selection_version?: number | null;
  readonly status?: number;
}

export type ApiOutcome<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: ApiFailure };

const NETWORK_FAILURE: ApiFailure = {
  error: "network",
  message: "Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.",
};

function outcome<T>(
  data: unknown,
  error: { message: string; status?: number } | null,
): ApiOutcome<T> {
  if (!error && data && typeof data === "object" && !("error" in (data as object))) {
    return { ok: true, data: data as T };
  }
  if (data && typeof data === "object" && "error" in (data as object)) {
    const body = data as Record<string, unknown>;
    return {
      ok: false,
      failure: {
        error: String(body.error),
        message: productBlockedMessage(body.error, body.message) ?? NETWORK_FAILURE.message,
        selection_version:
          typeof body.selection_version === "number" ? body.selection_version : null,
        status: error?.status,
      },
    };
  }
  // Мрежова грешка НИКОГА не е успех и не е отказ по същество.
  return { ok: false, failure: NETWORK_FAILURE };
}

/** Заявява обработката. Повторното извикване е безопасно и не плаща пак. */
export async function startProductFulfillment(
  entitlementId: string,
): Promise<ApiOutcome<Record<string, unknown>>> {
  const { data, error } = await invokeEdgeFunction<Record<string, unknown>>("fulfill-product", {
    body: { entitlement_id: entitlementId },
    retries: 0,
  });
  return outcome(data, error);
}

export async function fetchProductResultState(
  access: ResultStateAccess,
): Promise<ApiOutcome<ProductResultStateResponse>> {
  const { data, error } = await invokeEdgeFunction<ProductResultStateResponse>(
    "product-result-state",
    { body: { ...accessBody(access), action: "status" }, retries: 1 },
  );
  return outcome(data, error);
}

export async function saveProductSelection(
  access: ResultStateAccess,
  input: {
    readonly decisions: readonly CorrectionDecision[];
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  },
): Promise<ApiOutcome<SavedSelectionResponse>> {
  const { data, error } = await invokeEdgeFunction<SavedSelectionResponse>("product-result-state", {
    body: {
      ...accessBody(access),
      action: "save",
      decisions: input.decisions,
      expected_version: input.expectedVersion,
      idempotency_key: input.idempotencyKey,
    },
    retries: 0,
  });
  return outcome(data, error);
}

export interface RefinedResultResponse {
  readonly status: "ready";
  readonly replay: boolean;
  readonly result: unknown;
  readonly result_digest: string;
  readonly base_result_digest: string;
}

/**
 * Едно включено уточнение. Изпращаме точния очакван резултат и точната версия —
 * стар раздел не уточнява по-ново състояние.
 */
export async function refineProductResult(input: {
  readonly entitlementId: string;
  readonly instruction: string;
  readonly expectedResultDigest: string;
  readonly expectedRefinementVersion: number;
  readonly idempotencyKey: string;
}): Promise<ApiOutcome<RefinedResultResponse>> {
  const { data, error } = await invokeEdgeFunction<RefinedResultResponse>("refine-product", {
    body: {
      entitlement_id: input.entitlementId,
      instruction: input.instruction,
      expected_result_digest: input.expectedResultDigest,
      expected_refinement_version: input.expectedRefinementVersion,
      idempotency_key: input.idempotencyKey,
    },
    retries: 0,
  });
  return outcome(data, error);
}
