import { supabase } from "@/integrations/supabase/client";
import { sanitizeBranding } from "./sanitize";
import { loadBrandingAssetDataUrl } from "./storage";
import type { ResolvedBranding } from "./types";

let cache: { userId: string; at: number; value: ResolvedBranding | null } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function invalidateResolvedBranding(): void {
  cache = null;
}

/**
 * Зарежда активния брандинг профил на потребителя заедно с изображенията.
 * Връща `null`, ако няма профил или достъпът не е отключен — тогава
 * експортът минава по стандартния стил.
 */
export async function resolveBrandingForUser(userId: string): Promise<ResolvedBranding | null> {
  if (cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) return cache.value;

  const { data: profile } = await supabase
    .from("branding_profiles")
    .select("settings")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!profile) {
    cache = { userId, at: Date.now(), value: null };
    return null;
  }

  const settings = sanitizeBranding(profile.settings);
  const [logoDataUrl, signatureDataUrl, stampDataUrl] = await Promise.all([
    loadBrandingAssetDataUrl(settings.header.logoPath),
    loadBrandingAssetDataUrl(settings.signature.signaturePath),
    loadBrandingAssetDataUrl(settings.signature.stampPath),
  ]);

  const value: ResolvedBranding = { ...settings, logoDataUrl, signatureDataUrl, stampDataUrl };
  cache = { userId, at: Date.now(), value };
  return value;
}
