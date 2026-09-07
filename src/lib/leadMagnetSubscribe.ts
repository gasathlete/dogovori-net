/**
 * Незадължителен абонамент за бюлетина след lead magnet.
 *
 * Единственият път за запис е SECURITY DEFINER RPC-то `subscribe_lead_magnet`
 * (миграция 20260908090000_lead_magnet_consent_hardening). Клиентът:
 *  - изисква изрично, незадължено по подразбиране съгласие (checkbox);
 *  - нормализира и проверява имейла ПРЕДИ заявка (сървърът повтаря проверката);
 *  - праща само имейл, slug на материала, груба група на източника и флага за
 *    съгласие — без име, без суров път, без user agent;
 *  - никога не показва сурова грешка от базата на потребителя.
 */
import { pendingLeadMagnetClient } from "@/lib/leadMagnetPendingSchema";
import { isLeadMagnetSlug, LEAD_MAGNET_CONSENT_VERSION, type LeadMagnetSlug } from "@/lib/leadMagnets";
import {
  isLeadMagnetSourceGroup,
  normalizeLeadEmail,
  type LeadMagnetSourceGroup,
} from "@/lib/leadMagnetTrigger";

export type LeadMagnetSubscribeResult = "subscribed" | "invalid" | "error";

export interface LeadMagnetSubscribeInput {
  email: string;
  magnetSlug: LeadMagnetSlug;
  sourceGroup: LeadMagnetSourceGroup;
  /** Трябва да е `true` — резултат от изрично отметнат чекбокс. */
  marketingConsent: boolean;
}

/** Точният payload към RPC-то — изнесен, за да е проверим без мрежа. */
export function buildLeadMagnetSubscribeArgs(
  input: LeadMagnetSubscribeInput,
): { _email: string; _magnet_slug: string; _source_group: string; _marketing_consent: true } | null {
  if (input.marketingConsent !== true) return null;
  const email = normalizeLeadEmail(input.email);
  if (email === null) return null;
  if (!isLeadMagnetSlug(input.magnetSlug)) return null;
  if (!isLeadMagnetSourceGroup(input.sourceGroup)) return null;
  return {
    _email: email,
    _magnet_slug: input.magnetSlug,
    _source_group: input.sourceGroup,
    _marketing_consent: true,
  };
}

export async function subscribeToLeadMagnetNewsletter(
  input: LeadMagnetSubscribeInput,
): Promise<LeadMagnetSubscribeResult> {
  const args = buildLeadMagnetSubscribeArgs(input);
  if (args === null) return "invalid";
  try {
    const { data, error } = await supabase.rpc("subscribe_lead_magnet", args);
    if (error) return "error";
    return data === true ? "subscribed" : "invalid";
  } catch {
    return "error";
  }
}

/** Текст на съгласието — версията му се записва сървърно като consent_version. */
export const LEAD_MAGNET_CONSENT_COPY = {
  version: LEAD_MAGNET_CONSENT_VERSION,
  label:
    "Съгласявам се да получавам имейл бюлетина на Договори.нет с кратки практични съвети за договори — най-много два пъти месечно. Мога да се отпиша по всяко време чрез връзката във всеки имейл.",
  privacyLinkText: "Политика за поверителност",
  privacyHref: "/privacy",
} as const;
