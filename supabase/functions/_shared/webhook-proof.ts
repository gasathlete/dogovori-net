/** Raw Stripe proof, without SDK/network dependencies. Never reserialize before HMAC. */
export const WEBHOOK_MAX_BYTES = 1024 * 1024;

export async function boundedRequestText(req: Request, limit: number): Promise<string> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new Error("request_too_large");
  }
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("request_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function verifyStripeProof(
  signature: string | null, body: string, secret: string, environment: "sandbox" | "live", nowMs = Date.now(),
) {
  if (!signature || signature.length > 4096 || !body || !secret) throw new Error("missing_proof");
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamps.push(value);
    if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0]) || !signatures.length) throw new Error("invalid_proof");
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || Math.abs(nowMs / 1000 - timestamp) > 300) {
    throw new Error("expired_proof");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamps[0]}.${body}`)));
  // Fixed-length byte comparisons, including rotated webhook secrets/signatures.
  let accepted = 0;
  for (const candidate of signatures) {
    let difference = 0;
    for (let i = 0; i < signed.length; i++) difference |= signed[i] ^ parseInt(candidate.slice(i * 2, i * 2 + 2), 16);
    accepted |= Number(difference === 0);
  }
  if (!accepted) throw new Error("invalid_proof");
  const event = JSON.parse(body);
  if (!event || typeof event.id !== "string" || !/^evt_[A-Za-z0-9_]+$/.test(event.id) ||
    typeof event.type !== "string" || !event.type ||
    !Number.isSafeInteger(event.created) || event.created <= 0 ||
    event.livemode !== (environment === "live") ||
    !event.data || typeof event.data.object !== "object" || !event.data.object || Array.isArray(event.data.object)) {
    throw new Error("invalid_event");
  }
  return event as { id: string; created: number; livemode: boolean; type: string; data: { object: Record<string, unknown> } };
}
