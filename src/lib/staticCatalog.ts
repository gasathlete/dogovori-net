import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

export type StaticEnv = "sandbox" | "live";
export type StaticOrderState = "pending" | "paid" | "refunded" | "failed";
export interface StaticCatalogItem { id: string; product_key: string; template_slug: string | null; version: string; filename: string; mime_type: string; sha256: string; amount_cents: number; currency: string; }
export interface StaticCatalogResponse { ok: true; checkout_open: boolean; legal_versions: { terms: string; refund: string; withdrawal: string }; items: StaticCatalogItem[]; }
export interface StaticOrder { id: string; environment: StaticEnv; amount_cents: number; currency: string; created_at: string; product_key: string | null; version: string | null; filename: string | null; state: StaticOrderState; }

/** Environment comes from the build's payment token; null when payments are not configured. */
export function staticEnvironment(): StaticEnv | null {
  try { return getStripeEnvironment(); } catch { return null; }
}

export class StaticCatalogClientError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new StaticCatalogClientError("unauthorized");
  return data.session.access_token;
}

async function post(body: Record<string, unknown>, op?: string): Promise<Response> {
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/static-catalog${op ? `?op=${op}` : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
}

export async function staticCall<T>(body: Record<string, unknown>, op?: string): Promise<T> {
  const res = await post(body, op);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StaticCatalogClientError(typeof data?.code === "string" ? data.code : "unavailable");
  return data as T;
}

export async function downloadStaticOrder(orderId: string): Promise<void> {
  const res = await post({ action: "download", orderId });
  if (!res.ok) { await res.text(); throw new StaticCatalogClientError("download_denied"); }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "document";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const formatEur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export const ORDER_STATE_LABEL: Record<StaticOrderState, string> = {
  pending: "Очакваме потвърждение на плащането",
  paid: "Платено — можете да свалите файла",
  refunded: "Плащането е възстановено — достъпът е спрян",
  failed: "Плащането не е започнато",
};

/** Return-page state: only the server-confirmed order state counts; the URL is never proof of payment. */
export function returnBanner(params: URLSearchParams, order: StaticOrder | undefined): { tone: "info" | "success" | "error"; text: string } | null {
  if (!params.get("order")) return null;
  if (params.get("cancelled") === "1" && order?.state !== "paid") return { tone: "error", text: "Плащането беше прекъснато. Проверете състоянието на поръчката по-долу." };
  if (!order) return { tone: "info", text: "Проверяваме поръчката…" };
  if (order.state === "paid") return { tone: "success", text: "Плащането е потвърдено. Файлът е във Вашите покупки." };
  if (order.state === "refunded") return { tone: "error", text: ORDER_STATE_LABEL.refunded };
  return { tone: "info", text: "Очакваме потвърждение от платежния доставчик. Страницата се обновява сама." };
}
