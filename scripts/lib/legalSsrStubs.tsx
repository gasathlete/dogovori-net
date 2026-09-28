// Build-only replacements for the application chrome and browser analytics.
// No policy text is duplicated here; the four real policy components are rendered.
export function Header() { return null; }
export function Footer() { return null; }
export function revokeCookieConsent(): never {
  throw new Error("Cookie consent must never be changed during prerendering");
}
