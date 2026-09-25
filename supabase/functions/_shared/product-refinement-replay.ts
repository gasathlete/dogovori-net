/**
 * Само-четящо повторение на ВЕЧЕ успешно уточнение.
 *
 * Търси точно един ред по собственик + платено право + ключ за повторяемост
 * (UNIQUE(entitlement_id, idempotency_key) в схемата) и го връща САМО ако:
 *  - редът е `succeeded` и принадлежи на същия потребител/право/продукт;
 *  - оригиналният резултат, указанието и очакваната версия съвпадат точно;
 *  - записаният резултат е каноничен, отпечатъкът му е верен и минава пълната
 *    валидация на уточнен пакет спрямо текущия платен оригинал.
 *
 * Нищо не се записва. Всяко несъответствие е затворен отказ, не „най-близко“.
 */
import type { NegotiationPackageResult, ProductSourceBinding } from "./product-result-contract.ts";
import { validateRefinedNegotiation } from "./product-refinement.ts";

// deno-lint-ignore no-explicit-any
export type RefinementReplayDbClient = { from(table: string): any };

export type RefinementReplayLookup =
  | { readonly kind: "none" }
  | { readonly kind: "replay"; readonly result: unknown; readonly resultDigest: string }
  | { readonly kind: "conflict" }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" };

const DIGEST_RE = /^[0-9a-f]{64}$/;

export const REFINEMENT_REPLAY_SELECT =
  "id, user_id, entitlement_id, product_id, status, base_result_digest, instruction_digest, idempotency_key, expected_refinement_version, refinement_version, result, result_canonical, result_digest";

export async function findSucceededRefinementReplay(
  db: RefinementReplayDbClient,
  input: {
    readonly userId: string;
    readonly entitlementId: string;
    readonly idempotencyKey: string;
    readonly baseDigest: string;
    readonly expectedDigest: string;
    readonly instructionDigest: string;
    readonly expectedVersion: number;
    readonly base: NegotiationPackageResult;
    readonly binding: ProductSourceBinding;
  },
  deps: {
    readonly canonical: (value: unknown) => string;
    readonly sha256Hex: (value: string) => Promise<string>;
  },
): Promise<RefinementReplayLookup> {
  let row: Record<string, unknown> | null;
  try {
    const { data, error } = await db
      .from("product_result_refinements")
      .select(REFINEMENT_REPLAY_SELECT)
      .eq("user_id", input.userId)
      .eq("entitlement_id", input.entitlementId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    row = (data ?? null) as Record<string, unknown> | null;
  } catch {
    return { kind: "unavailable" };
  }
  if (row === null) return { kind: "none" };
  // Незавършен/провален ред минава по нормалния път с всички текущи прегради.
  if (row.status !== "succeeded") return { kind: "none" };

  if (
    row.user_id !== input.userId ||
    row.entitlement_id !== input.entitlementId ||
    row.idempotency_key !== input.idempotencyKey ||
    row.product_id !== "negotiation_package"
  ) {
    return { kind: "conflict" };
  }
  if (
    row.base_result_digest !== input.baseDigest ||
    input.expectedDigest !== input.baseDigest ||
    row.instruction_digest !== input.instructionDigest ||
    row.expected_refinement_version !== input.expectedVersion
  ) {
    return { kind: "conflict" };
  }

  const canonicalText = row.result_canonical;
  const digest = row.result_digest;
  if (
    typeof canonicalText !== "string" ||
    typeof digest !== "string" ||
    !DIGEST_RE.test(digest) ||
    row.result === null ||
    row.result === undefined ||
    deps.canonical(row.result) !== canonicalText ||
    (await deps.sha256Hex(canonicalText)) !== digest
  ) {
    return { kind: "invalid" };
  }
  try {
    validateRefinedNegotiation(row.result, input.base, input.binding);
  } catch {
    return { kind: "invalid" };
  }
  return { kind: "replay", result: row.result, resultDigest: digest };
}
