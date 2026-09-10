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
  "refinement_ready",
  "refinement_processing",
  "exhausted",
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
