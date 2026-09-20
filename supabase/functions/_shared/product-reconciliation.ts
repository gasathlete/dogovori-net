/**
 * НЕИЗЯСНЕН ИЗХОД НА ДОСТАВЧИК (Gate 3).
 *
 * Когато платено извикване е заявено, но изходът му НЕ е доказано записан, не е
 * вярно нито „повторим провал“, нито „окончателен провал“:
 *  - повторимият би позволил второ платено извикване по същата самоличност;
 *  - окончателният при уточнението би ОСВОБОДИЛ включеното уточнение.
 *
 * Затова състоянието се вписва изрично като неизяснено. То замразява реда,
 * блокира нова задача/ново уточнение за същото право и се разрешава само от
 * оператор. Никога не връща пари и никога не извиква модела повторно.
 *
 * Тук не влиза текст на документ, изход на модел или тяло на доставчик — само
 * затворени кодове и идентификатор на извикването.
 */

export const PRODUCT_RECONCILIATION_CODES = Object.freeze([
  "call_completion_unknown",
  "call_record_unknown",
  "provider_outcome_unknown",
  "persist_unknown",
  "output_unusable",
] as const);

export type ProductReconciliationCode = (typeof PRODUCT_RECONCILIATION_CODES)[number];

export const PRODUCT_RECONCILIATION_MESSAGE =
  "Изходът от последната обработка остана неизяснен. Проверяваме го ръчно и ще получите отговор. " +
  "Плащането ви е записано, а резултатът няма да бъде презаписан.";

/**
 * Когато самото вписване на неизясненото състояние НЕ успее, отговорът не бива
 * да твърди, че състоянието е записано трайно. Връща се отделен код: базата
 * продължава да спира второ извикване по същата самоличност.
 */
export const PRODUCT_LEDGER_UNAVAILABLE_CODE = "reconciliation_ledger_unavailable";
export const PRODUCT_LEDGER_UNAVAILABLE_MESSAGE =
  "Обработката е спряна, но записът за ръчна проверка не се получи. " +
  "Плащането ви е записано. Опитайте отново по-късно или ни пишете.";

/** Затворена грешка: извикването може да е било изпълнено, но не е записано. */
export class ProductUncertainCallError extends Error {
  readonly code: ProductReconciliationCode;
  readonly callId: string | null;
  constructor(code: ProductReconciliationCode, callId: string | null = null) {
    super(code);
    this.name = "ProductUncertainCallError";
    this.code = code;
    this.callId = callId;
  }
}

export interface ReconciliationRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export interface ProductReconciliationState {
  readonly jobRequired: boolean;
  readonly refinementRequired: boolean;
  readonly code: string | null;
}

/**
 * Детерминирано ЧЕТЕНЕ преди всяка променлива стъпка. Провал при четенето НЕ е
 * „няма проблем“: връща се неизяснено състояние, за да остане затворено.
 */
export async function readProductReconciliationState(
  db: ReconciliationRpcClient,
  userId: string,
  entitlementId: string,
): Promise<ProductReconciliationState> {
  const { data, error } = await db.rpc("product_reconciliation_state", {
    p_user_id: userId,
    p_entitlement_id: entitlementId,
  });
  if (error) return { jobRequired: true, refinementRequired: true, code: "state_unreadable" };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { jobRequired: true, refinementRequired: true, code: "state_unreadable" };
  const job = (row.job ?? null) as Record<string, unknown> | null;
  const refinement = (row.refinement ?? null) as Record<string, unknown> | null;
  return {
    jobRequired: job !== null,
    refinementRequired: refinement !== null,
    code: typeof (job?.code ?? refinement?.code) === "string"
      ? String(job?.code ?? refinement?.code)
      : null,
  };
}

/** Вписва неизяснено състояние на задачата. Никога не хвърля навън. */
export async function markProductJobReconciliation(
  db: ReconciliationRpcClient,
  jobId: string,
  leaseToken: string,
  code: ProductReconciliationCode,
  callId: string | null = null,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("mark_product_job_reconciliation", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_code: code,
      p_call_id: callId,
    });
    if (error) return false;
    return (data as Record<string, unknown> | null)?.ok === true;
  } catch {
    return false;
  }
}

/** Вписва неизяснено състояние на уточнението. Никога не хвърля навън. */
export async function markProductRefinementReconciliation(
  db: ReconciliationRpcClient,
  refinementId: string,
  leaseToken: string,
  code: ProductReconciliationCode,
  callId: string | null = null,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("mark_product_refinement_reconciliation", {
      p_refinement_id: refinementId,
      p_lease_token: leaseToken,
      p_code: code,
      p_call_id: callId,
    });
    if (error) return false;
    return (data as Record<string, unknown> | null)?.ok === true;
  } catch {
    return false;
  }
}
