import { supabase } from "@/integrations/supabase/client";
import { buildWaitlistArgs, type PrelaunchFeature } from "@/lib/prelaunch";

export type WaitlistResult = "accepted" | "invalid" | "unavailable";

export const PRELAUNCH_WAITLIST_EVENT = "dogovori:prelaunch-waitlist";

export function openPrelaunchWaitlist(feature: PrelaunchFeature): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRELAUNCH_WAITLIST_EVENT, { detail: { feature } }));
}

/**
 * Записва заявката само чрез RPC `request_prelaunch_waitlist`.
 * Ако функцията липсва (неприложена миграция) или върне грешка — "unavailable";
 * никога не казваме „записано“, без сървърът да потвърди `true`.
 */
export async function submitPrelaunchWaitlist(input: {
  email: string;
  feature: string;
  consent: boolean;
}): Promise<WaitlistResult> {
  const args = buildWaitlistArgs(input);
  if (args === null) return "invalid";
  try {
    // RPC още не е в генерираните типове (миграцията не е приложена).
    const rpc = supabase.rpc as unknown as (
      fn: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc("request_prelaunch_waitlist", { ...args });
    if (error) return "unavailable";
    return data === true ? "accepted" : "unavailable";
  } catch {
    return "unavailable";
  }
}
