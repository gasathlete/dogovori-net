/**
 * Четене на платените продуктови привилегии от браузъра.
 *
 * Достъпът е само SELECT върху собствения ред (RLS). Клиентът никога не пише
 * статус или резултат — това правят единствено сървърните функции.
 *
 * Забележка: таблиците се създават с миграцията от Stage 2A. Докато
 * генерираните типове не я включват, четем през нетипизиран достъп, но
 * резултатът се стеснява до тесните типове по-долу.
 */
import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_ENTITLEMENT_STATUSES = [
  "paid",
  "processing",
  "ready",
  "failed",
  "refunded",
] as const;

export type ProductEntitlementStatus = (typeof PRODUCT_ENTITLEMENT_STATUSES)[number];

export interface ProductEntitlement {
  id: string;
  product_id: string;
  status: string;
  amount_cents: number;
  environment: string;
  stripe_session_id: string;
  source_hash: string;
  created_at: string;
}

const SELECT =
  "id, product_id, status, amount_cents, environment, stripe_session_id, source_hash, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

/** Привилегията за конкретна платена Stripe сесия — или null. */
export async function fetchEntitlementBySession(
  userId: string,
  sessionId: string,
): Promise<ProductEntitlement | null> {
  const { data } = await db
    .from("product_entitlements")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  return (data as ProductEntitlement | null) ?? null;
}

/** Последната покупка на потребителя — за екрана със състоянието. */
export async function fetchLatestEntitlement(
  userId: string,
): Promise<ProductEntitlement | null> {
  const { data } = await db
    .from("product_entitlements")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ProductEntitlement | null) ?? null;
}

export interface ProductOrderProof {
  id: string;
  product_id: string;
  payment_status: string;
  purchase_kind: string;
  price_amount: number;
  currency: string;
  environment: string;
  product_source_document_id: string | null;
  product_source_hash: string | null;
}

const SNAPSHOT_SELECT =
  "id, product_id, payment_status, purchase_kind, price_amount, currency, environment, product_source_document_id, product_source_hash";

export interface PaidProductPurchase {
  entitlement: ProductEntitlement;
  order: ProductOrderProof;
}

/**
 * Едно платено право съществува само когато ЕДНОВРЕМЕННО има платена поръчка и
 * привилегия за същия потребител, същата Stripe сесия, същия продукт и същия
 * източник. Само привилегия (или само поръчка) не е доказателство.
 */
export async function fetchPaidProductPurchase(
  userId: string,
  sessionId: string,
): Promise<PaidProductPurchase | null> {
  const [entitlement, snapshotRes] = await Promise.all([
    fetchEntitlementBySession(userId, sessionId),
    db
      .from("order_snapshots")
      .select(SNAPSHOT_SELECT)
      .eq("user_id", userId)
      .eq("stripe_session_id", sessionId)
      .maybeSingle(),
  ]);
  const order = (snapshotRes?.data as ProductOrderProof | null) ?? null;
  if (!entitlement || !order) return null;
  if (order.payment_status !== "paid" || order.purchase_kind !== "product") return null;
  if (order.product_id !== entitlement.product_id) return null;
  if (order.environment !== entitlement.environment) return null;
  if (
    order.product_source_hash !== null &&
    order.product_source_hash !== entitlement.source_hash
  ) {
    return null;
  }
  return { entitlement, order };
}
