/**
 * Входният пакет („5 операции без абонамент“) е най-краткият път до плащане.
 * Тук са дестинациите и allowlist-ът за `?checkout=` — държим ги на едно място,
 * за да е невъзможно анонимният CTA да загуби целевата страница.
 */
import { ENTRY_PACK_CONFIG } from "@/lib/pricing";

/** Крайна дестинация след вход: отваря директно checkout в профила. */
export function entryPackCheckoutTarget(): string {
  return `/account?tab=subscription&checkout=${ENTRY_PACK_CONFIG.priceId}`;
}

/** CTA линк — анонимният запазва точната дестинация през регистрацията. */
export function entryPackCtaHref(isAuthed: boolean): string {
  const target = entryPackCheckoutTarget();
  if (isAuthed) return target;
  return `/auth?tab=signup&redirect=${encodeURIComponent(target)}&intent=one_off_${ENTRY_PACK_CONFIG.priceId}`;
}

/**
 * Кои `?checkout=` стойности приемаме. Всичко извън списъка се игнорира —
 * така URL параметър не може да отвори плащане за произволен lookup key.
 */
export const CHECKOUT_QUERY_ALLOWLIST: readonly string[] = [
  "pro_monthly",
  "pro_yearly",
  "professional_monthly",
  "professional_yearly",
  "entrepreneur_monthly",
  "entrepreneur_yearly",
  ENTRY_PACK_CONFIG.priceId,
] as const;

export function isAllowedCheckoutPrice(value: string | null | undefined): boolean {
  return !!value && CHECKOUT_QUERY_ALLOWLIST.includes(value);
}
