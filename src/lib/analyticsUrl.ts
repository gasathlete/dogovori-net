/**
 * Analytics never receives query strings or fragments: search text (?q=) and any
 * other user-typed value stay in the browser URL only. utm_source is read separately.
 */
export function analyticsPath(path: string): string {
  const cut = path.split(/[?#]/, 1)[0] || "/";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

export function analyticsLocation(origin: string, path: string): string {
  return origin + analyticsPath(path);
}

/** Same-origin referrers keep only the path; external referrers keep only the origin. */
export function analyticsReferrer(referrer: string | null | undefined, ownOrigin: string): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.origin === ownOrigin ? u.origin + u.pathname : u.origin;
  } catch {
    return null;
  }
}
