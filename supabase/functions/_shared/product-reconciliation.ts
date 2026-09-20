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
  /** Окончателно погасено извикване по задачата (решение „consume“ от оператор). */
  readonly terminalJob: boolean;
  /** Окончателно погасено извикване по уточнението. */
  readonly terminalRefinement: boolean;
  /** Висящо/незавършено извикване за уточнение без разрешение. */
  readonly orphanRefinementCall: boolean;
  readonly code: string | null;
}

const UNREADABLE: ProductReconciliationState = Object.freeze({
  jobRequired: true,
  refinementRequired: true,
  terminalJob: false,
  terminalRefinement: false,
  orphanRefinementCall: false,
  code: "state_unreadable",
});

const TERMINAL_KINDS = Object.freeze(["job", "refinement"] as const);

/** Затворен набор: всяка друга стойност се третира като нечетимо състояние. */
function normalizeCode(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  return (PRODUCT_RECONCILIATION_CODES as readonly string[]).includes(value) ? value : "invalid";
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
  let data: unknown;
  try {
    const res = await db.rpc("product_reconciliation_state", {
      p_user_id: userId,
      p_entitlement_id: entitlementId,
    });
    if (res.error) return UNREADABLE;
    data = res.data;
  } catch {
    return UNREADABLE;
  }
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return UNREADABLE;
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) return UNREADABLE;

  const job = normalizeSubject(row.job);
  const refinement = normalizeSubject(row.refinement);
  if (job === "invalid" || refinement === "invalid") return UNREADABLE;

  // terminal: null или масив САМО от познати видове.
  let terminalJob = false;
  let terminalRefinement = false;
  const terminal = row.terminal ?? null;
  if (terminal !== null) {
    if (!Array.isArray(terminal)) return UNREADABLE;
    for (const kind of terminal) {
      if (typeof kind !== "string" || !(TERMINAL_KINDS as readonly string[]).includes(kind)) {
        return UNREADABLE;
      }
      if (kind === "job") terminalJob = true;
      if (kind === "refinement") terminalRefinement = true;
    }
  }

  // orphan_refinement_call: само true или null.
  const orphanRaw = row.orphan_refinement_call ?? null;
  if (orphanRaw !== null && orphanRaw !== true) return UNREADABLE;
  const orphanRefinementCall = orphanRaw === true;

  const code = job?.code ?? refinement?.code ??
    (terminalJob || terminalRefinement
      ? "reconciliation_terminal"
      : orphanRefinementCall
      ? "refinement_call_orphaned"
      : null);

  return {
    jobRequired: job !== null || terminalJob,
    refinementRequired: refinement !== null || terminalRefinement || orphanRefinementCall,
    terminalJob,
    terminalRefinement,
    orphanRefinementCall,
    code,
  };
}

/** Връща null (няма ред), обекта с валиден код, или "invalid" при чужда форма. */
function normalizeSubject(value: unknown): { code: string | null } | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const code = normalizeCode((value as Record<string, unknown>).code);
  if (code === "invalid") return "invalid";
  return { code };
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
