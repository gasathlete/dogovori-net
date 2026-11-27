/**
 * ТРАЕН ЗАПИС НА ПЛАТЕНИТЕ ИЗВИКВАНИЯ (Gate 3).
 *
 * Изнесено от `fulfill-product/index.ts` без промяна на поведението, за да може
 * да се проверява мрежово тихо. Правилото е едно: заявката се записва ПРЕДИ
 * доставчика, а изход, който не е доказано записан, става НЕИЗЯСНЕН — никога
 * повторно извикване и никога тих провал.
 */
import {
  canonicalProductJson,
  productCanonicalDigest,
  ProductGenerationError,
  type ProductCallStore,
  type ProductModelPort,
  type ProductModelRequest,
  type ProductModelResponse,
} from "./product-generation-runtime.ts";
import { ProductUncertainCallError } from "./product-reconciliation.ts";

export type StoredCallRequest = ProductModelRequest & {
  readonly requestDigest: string;
  readonly cursorKey: string;
};

export interface CallStoreRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export function createProductCallStore(
  admin: CallStoreRpcClient,
  jobId: string,
  leaseToken: string,
): ProductCallStore {
  return Object.freeze({
    async reserve(request: StoredCallRequest) {
      const { data, error } = await admin.rpc("reserve_product_generation_call", {
        p_job_id: jobId, p_lease_token: leaseToken, p_call_id: request.callId,
        p_cursor_key: request.cursorKey, p_stage: request.routeKey, p_model: request.model,
        p_request_digest: request.requestDigest,
      });
      const row = (data ?? {}) as Record<string, unknown>;
      if (error || row.ok !== true) throw new ProductGenerationError("invalid_cursor", true);
      // Заявено, но неприключено извикване: доставчикът МОЖЕ да е бил изпълнен.
      // Това НЕ е повторим провал — второ извикване по същата самоличност е
      // забранено. Състоянието става изрично неизяснено.
      if (row.status === "pending") {
        throw new ProductUncertainCallError("call_completion_unknown", request.callId);
      }
      if (row.status === "complete") {
        const response = row.response as Record<string, unknown> | undefined;
        if (
          !response || !("output" in response) ||
          !Number.isSafeInteger(response.inputTokens) ||
          !Number.isSafeInteger(response.outputTokens)
        ) {
          throw new ProductGenerationError("invalid_cursor");
        }
        return {
          status: "complete" as const,
          response: response as unknown as Awaited<ReturnType<ProductModelPort["invoke"]>>,
        };
      }
      if (row.status !== "acquired" || typeof row.reservation_token !== "string") {
        throw new ProductGenerationError("invalid_cursor");
      }
      return { status: "acquired" as const, reservationToken: row.reservation_token };
    },
    async complete(
      request: StoredCallRequest,
      response: ProductModelResponse,
      reservationToken: string,
      costMicroUsd: number,
    ) {
      const canonical = canonicalProductJson(response.output);
      const artifactDigest = await productCanonicalDigest(response.output);
      const { data, error } = await admin.rpc("complete_product_generation_call", {
        p_job_id: jobId, p_lease_token: leaseToken, p_call_id: request.callId,
        p_request_digest: request.requestDigest, p_reservation_token: reservationToken,
        p_redacted_artifact: response.output, p_redacted_artifact_canonical: canonical,
        p_artifact_digest: artifactDigest, p_usage_input_tokens: response.inputTokens,
        p_usage_output_tokens: response.outputTokens, p_usage_cost_micro_usd: costMicroUsd,
      });
      // Доставчикът вече е бил извикан. Ако записът не успее, изходът е
      // неизяснен: нито се повтаря, нито се обявява за провал.
      if (error || (data as Record<string, unknown> | null)?.ok !== true) {
        throw new ProductUncertainCallError("call_record_unknown", request.callId);
      }
    },
  });
}
