/**
 * Post-login destination with explicit-vs-fallback provenance.
 * A fallback (`/account` when the user named no destination) may be replaced by
 * the server-captured signup handoff path; an explicit safe intent may not.
 * The fallback marker stores the exact value it describes, so a stale marker
 * never downgrades a later explicit destination.
 */
import { safeReturnPath } from "@/lib/safeRoute";

export const POST_LOGIN_KEY = "post_login_redirect";
export const POST_LOGIN_FALLBACK_KEY = "post_login_redirect_fallback";

export function setPostLoginDestination(path: string, explicit: boolean): void {
  sessionStorage.setItem(POST_LOGIN_KEY, path);
  if (explicit) sessionStorage.removeItem(POST_LOGIN_FALLBACK_KEY);
  else sessionStorage.setItem(POST_LOGIN_FALLBACK_KEY, path);
}

export function clearPostLoginDestination(): void {
  sessionStorage.removeItem(POST_LOGIN_KEY);
  sessionStorage.removeItem(POST_LOGIN_FALLBACK_KEY);
}

/** Apply a server-captured handoff path; it beats only a missing or fallback destination. */
export function applyHandoffDestination(serverPath: string): boolean {
  const current = sessionStorage.getItem(POST_LOGIN_KEY);
  const fallback = sessionStorage.getItem(POST_LOGIN_FALLBACK_KEY);
  const isFallback = current === null || (fallback !== null && fallback === current);
  if (!isFallback) return false;
  const safe = safeReturnPath(serverPath, "/account");
  sessionStorage.setItem(POST_LOGIN_KEY, safe);
  sessionStorage.removeItem(POST_LOGIN_FALLBACK_KEY);
  return true;
}
