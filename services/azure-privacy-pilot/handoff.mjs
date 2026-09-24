/**
 * Content-free, short-lived handoff between Dogovori.net and an independent
 * document service. This module does not upload documents or enable checkout.
 * The issuer and verifier must run on trusted servers; the signing key must
 * never be exposed to a browser or committed to source control.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const PRODUCTS = new Set(["contract_check", "contract_improve", "negotiation_package"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 300;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unbase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4096) throw new Error("Invalid handoff");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function signingKey(secret) {
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32) throw new Error("Invalid signing configuration");
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function validClaims(c, now, audience) {
  return c && typeof c === "object" && !Array.isArray(c) &&
    c.iss === "dogovori.net" && c.aud === audience &&
    UUID.test(c.sub) && UUID.test(c.op) && UUID.test(c.jti) &&
    PRODUCTS.has(c.product) && Number.isInteger(c.iat) && Number.isInteger(c.exp) &&
    c.iat <= now + 30 && c.exp > now && c.exp - c.iat > 0 && c.exp - c.iat <= TTL_SECONDS;
}

/** Only opaque UUIDs and a fixed product ID are accepted; never document data. */
export async function issueHandoff({ subject, operationId, product, audience, secret, now = Date.now() }) {
  const issued = Math.floor(now / 1000);
  const claims = {
    iss: "dogovori.net", aud: audience, sub: subject, op: operationId,
    product, jti: crypto.randomUUID(), iat: issued, exp: issued + TTL_SECONDS,
  };
  if (audience !== "dogovori-azure-intake" || !validClaims(claims, issued, audience)) {
    throw new Error("Invalid handoff claims");
  }
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const key = await signingKey(secret);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
  return `${payload}.${signature}`;
}

/**
 * consumeOnce must atomically reserve a jti until exp in durable storage.
 * A missing consumer fails closed. The caller must still check the user's
 * entitlement and bind the resulting upload to the returned operation ID.
 */
export async function verifyAndConsumeHandoff({ token, secret, consumeOnce, now = Date.now() }) {
  if (typeof token !== "string" || token.length > 4096 || typeof consumeOnce !== "function") {
    throw new Error("Invalid handoff");
  }
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid handoff");
  const key = await signingKey(secret);
  const signature = unbase64url(parts[1]);
  if (signature.byteLength !== 32 || !await crypto.subtle.verify("HMAC", key, signature, encoder.encode(parts[0]))) {
    throw new Error("Invalid handoff");
  }
  let claims;
  try { claims = JSON.parse(decoder.decode(unbase64url(parts[0]))); }
  catch { throw new Error("Invalid handoff"); }
  if (!validClaims(claims, Math.floor(now / 1000), "dogovori-azure-intake")) throw new Error("Invalid handoff");
  if (!await consumeOnce(claims.jti, claims.exp)) throw new Error("Invalid handoff");
  return { subject: claims.sub, operationId: claims.op, product: claims.product };
}
