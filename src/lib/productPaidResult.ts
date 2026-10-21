/**
 * Зареждане на ТОЧНО едно платено продуктово право и неговия проверен резултат.
 *
 * Правила, които този модул налага в браузъра:
 *  - два взаимно изключващи се начина за достъп: връщане от плащане (точна
 *    Stripe сесия) и собственик (точно право). НИКОГА „последната покупка“;
 *  - плащането е доказано двойно: платена поръчка + право за същата сесия,
 *    същия продукт, същата среда и същия документ;
 *  - резултатът се приема само след пълна проверка спрямо обвързването на
 *    източника, записано в реда — иначе не се показва нищо;
 *  - текстът на документа се приема само когато SHA-256 и дължината съвпадат.
 *
 * Модулът НЕ показва примерни резултати и не харчи общи операции.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  parseReadyProductResult,
  type ProductResultId,
  type ProductSourceBinding,
  type ReadyProductResult,
} from "@/lib/productResults";
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
  normalizeProductSourceText,
} from "@/lib/productSource";
import { isOneTimeProductId } from "@/lib/products";
import { snapshotAmountToCents } from "../../supabase/functions/_shared/product-purchase";

/** Точната Stripe сесия от връщането след плащане. */
export const CHECKOUT_SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,240}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PaidAccessRequest =
  | { readonly mode: "checkout_return"; readonly sessionId: string }
  | { readonly mode: "owner"; readonly entitlementId: string };

/** Разчита адреса на страницата в точно един начин за достъп — или null. */
export function readPaidAccessRequest(params: URLSearchParams): PaidAccessRequest | null {
  const session = params.get("session_id");
  const entitlement = params.get("entitlement_id");
  if (session && entitlement) return null;
  if (session && CHECKOUT_SESSION_RE.test(session)) {
    return { mode: "checkout_return", sessionId: session };
  }
  if (entitlement && UUID_RE.test(entitlement)) {
    return { mode: "owner", entitlementId: entitlement };
  }
  return null;
}

export interface PaidEntitlementRow {
  id: string;
  product_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  environment: string;
  stripe_session_id: string;
  source_document_id: string | null;
  source_hash: string;
  source_updated_at: string | null;
  source_char_count: number | null;
  source_char_unit: string | null;
  source_kind: string | null;
  source_page_count: number | null;
  result: unknown;
  result_schema_version: number | null;
  refinements_included: number;
  refinements_used: number;
  refinement_state: string;
  last_error_code: string | null;
  created_at: string;
}

const DETAIL_SELECT = [
  "id",
  "product_id",
  "status",
  "amount_cents",
  "currency",
  "environment",
  "stripe_session_id",
  "source_document_id",
  "source_hash",
  "source_updated_at",
  "source_char_count",
  "source_char_unit",
  "source_kind",
  "source_page_count",
  "result",
  "result_schema_version",
  "refinements_included",
  "refinements_used",
  "refinement_state",
  "last_error_code",
  "created_at",
].join(", ");

const SNAPSHOT_SELECT =
  "id, product_id, payment_status, purchase_kind, price_amount, currency, environment, product_source_document_id, product_source_hash";

interface OrderProof {
  product_id: string;
  payment_status: string;
  purchase_kind: string;
  price_amount: number;
  currency: string;
  environment: string;
  product_source_document_id: string | null;
  product_source_hash: string | null;
}

// Таблиците идват с миграциите от Stage 2A/2B: докато генерираните типове не
// ги включват, четем през нетипизиран достъп и стесняваме резултата тук.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export interface PaidPurchase {
  readonly entitlement: PaidEntitlementRow;
  readonly order: OrderProof;
}

/**
 * Правото и платената поръчка за ТОЧНО заявения достъп. Липсва ли едното —
 * няма покупка. Никакво връщане към „последната“.
 */
export async function loadPaidPurchase(
  userId: string,
  access: PaidAccessRequest,
): Promise<PaidPurchase | null> {
  let query = db.from("product_entitlements").select(DETAIL_SELECT).eq("user_id", userId);
  query = access.mode === "checkout_return"
    ? query.eq("stripe_session_id", access.sessionId)
    : query.eq("id", access.entitlementId);
  const { data } = await query.maybeSingle();
  const entitlement = (data as PaidEntitlementRow | null) ?? null;
  if (!entitlement) return null;
  if (!isOneTimeProductId(entitlement.product_id)) return null;

  const { data: snapshot } = await db
    .from("order_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("user_id", userId)
    .eq("stripe_session_id", entitlement.stripe_session_id)
    .maybeSingle();
  const order = (snapshot as OrderProof | null) ?? null;
  if (!order) return null;
  if (order.payment_status !== "paid" || order.purchase_kind !== "product") return null;
  if (order.product_id !== entitlement.product_id) return null;
  if (order.environment !== entitlement.environment) return null;
  // `order_snapshots.price_amount` е в цели валутни единици (евро), а правото е
  // в евроцентове. Сравнението минава през същото строго преобразуване като на
  // сървъра — иначе точната платена сума не съвпада никога.
  if (snapshotAmountToCents(order.price_amount) !== entitlement.amount_cents) return null;
  if (
    order.product_source_hash !== null &&
    order.product_source_hash.toLowerCase() !== entitlement.source_hash.toLowerCase()
  ) {
    return null;
  }
  if (
    order.product_source_document_id !== null &&
    entitlement.source_document_id !== null &&
    order.product_source_document_id !== entitlement.source_document_id
  ) {
    return null;
  }
  return { entitlement, order };
}

/** Измереното обвързване на източника, записано в реда — или null. */
export function bindingFromEntitlement(row: PaidEntitlementRow): ProductSourceBinding | null {
  if (
    !row.source_document_id ||
    !row.source_updated_at ||
    typeof row.source_char_count !== "number" ||
    row.source_char_unit !== PRODUCT_SOURCE_CHAR_UNIT ||
    (row.source_kind !== "pdf" && row.source_kind !== "docx" && row.source_kind !== "owner_text")
  ) {
    return null;
  }
  return {
    document_id: row.source_document_id,
    source_hash: row.source_hash.toLowerCase(),
    source_kind: row.source_kind,
    char_count: row.source_char_count,
    char_unit: PRODUCT_SOURCE_CHAR_UNIT,
    source_updated_at: row.source_updated_at,
    page_count: typeof row.source_page_count === "number" ? row.source_page_count : null,
  };
}

export type PaidResultOutcome =
  | { readonly ok: true; readonly result: ReadyProductResult; readonly binding: ProductSourceBinding }
  | { readonly ok: false; readonly reason: "not_ready" | "unbound" | "invalid" };

/**
 * Приема резултата само когато е за ТОЧНО този продукт и ТОЧНО този източник.
 */
export function readPaidResult(row: PaidEntitlementRow): PaidResultOutcome {
  if (row.status !== "ready" || row.result === null || row.result === undefined) {
    return { ok: false, reason: "not_ready" };
  }
  const binding = bindingFromEntitlement(row);
  if (!binding) return { ok: false, reason: "unbound" };
  const parsed = parseReadyProductResult(row.result, binding, row.product_id as ProductResultId);
  if (!parsed.ok) return { ok: false, reason: "invalid" };
  return { ok: true, result: parsed.result, binding };
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Каноничен JSON с подредени ключове — един резултат дава един и същ хеш. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export type BoundSourceOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "not_found" | "source_changed" };

/**
 * Точният платен текст на документа. Приема се само при пълно съвпадение на
 * SHA-256 и дължината в Unicode кодови точки — иначе поправка не се прилага.
 */
export async function loadBoundSourceText(
  binding: ProductSourceBinding,
): Promise<BoundSourceOutcome> {
  const { data } = await db
    .from("uploaded_contracts")
    .select("id, extracted_text")
    .eq("id", binding.document_id)
    .maybeSingle();
  const raw = (data as { extracted_text?: unknown } | null)?.extracted_text;
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "not_found" };
  const text = normalizeProductSourceText(raw);
  if (countProductSourceChars(text) !== binding.char_count) {
    return { ok: false, reason: "source_changed" };
  }
  const hash = await sha256Hex(text);
  if (hash !== binding.source_hash.toLowerCase()) return { ok: false, reason: "source_changed" };
  return { ok: true, text };
}

/** Цена на български: „2,99 €“. */
export function priceBg(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}
