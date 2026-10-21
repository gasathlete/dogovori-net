import { buildCors } from "./cors.ts";

/** A navigation destination must be on an exact app origin, never a caller's site. */
export function requireAppReturnUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\\\r\n\t]/.test(value)) {
    throw new Error("Невалиден адрес за връщане.");
  }
  let url: URL;
  try { url = new URL(value.replace("{CHECKOUT_SESSION_ID}", "checkout_session_placeholder")); }
  catch { throw new Error("Невалиден адрес за връщане."); }
  const allowed = buildCors(new Request("https://internal.invalid", { headers: { origin: url.origin } }))["Access-Control-Allow-Origin"];
  if (allowed !== url.origin || url.username || url.password || (url.protocol !== "https:" && url.origin !== "http://localhost:8080")) {
    throw new Error("Адресът за връщане трябва да е в Dogovori.net.");
  }
  return value;
}