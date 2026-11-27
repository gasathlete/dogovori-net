/**
 * DTrust Basic — доказателствено ядро (чист модул, без Deno/DB API).
 *
 * DTrust Basic е ОБИКНОВЕН електронен подпис (SES) с документирано изявление.
 * Не е квалифициран (QES) и не е усъвършенстван (AdES/PAdES) подпис: няма
 * криптографско вграждане в PDF. Модулът дава:
 *  - канонично SHA-256 на точната версия на документа (version lock);
 *  - чисти проверки кой и кога може да действа;
 *  - детерминистичен одитен сертификат (JSON) с хеш, без OTP/токени/ЕГН.
 */

export const DTRUST_EVIDENCE_VERSION = "dtrust-ses-v1" as const;
export const DTRUST_SIGNATURE_LEVEL = "simple_electronic_signature" as const;

/** Каноничен JSON: сортирани ключове, без undefined. Детерминистичен. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return "null";
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Хеш на точната подписвана версия (заглавие + съдържание). */
export function documentDigest(title: string, snapshot: unknown): Promise<string> {
  return sha256Hex(canonicalJson({ v: DTRUST_EVIDENCE_VERSION, title, snapshot }));
}

const HEX64 = /^[0-9a-f]{64}$/;
export function isSha256Hex(v: unknown): v is string {
  return typeof v === "string" && HEX64.test(v);
}

/** Сравнение без ранно прекъсване (хешовете са с фиксирана дължина). */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type LockProblem = "document_unlocked" | "document_changed";

/**
 * Версията е заключена при създаване (`metadata.document_sha256`). Ако текущото
 * съдържание не дава същия хеш → документът е променен и ВСИЧКИ покани спират.
 * Стари заявки без заключване не могат да бъдат подписвани (fail-closed).
 */
export async function checkDocumentLock(env: {
  title: string;
  document_snapshot: unknown;
  metadata: unknown;
}): Promise<{ ok: true; digest: string } | { ok: false; code: LockProblem }> {
  const meta = (env.metadata && typeof env.metadata === "object") ? env.metadata as Record<string, unknown> : {};
  const locked = meta.document_sha256;
  if (!isSha256Hex(locked) || meta.evidence_version !== DTRUST_EVIDENCE_VERSION) {
    return { ok: false, code: "document_unlocked" };
  }
  const current = await documentDigest(env.title, env.document_snapshot);
  if (!safeEqualHex(current, locked)) return { ok: false, code: "document_changed" };
  return { ok: true, digest: current };
}

const FINAL_ENVELOPE = new Set(["cancelled", "completed", "expired", "declined"]);
const FINAL_SIGNER = new Set(["signed", "declined"]);

export type GateProblem =
  | "envelope_cancelled" | "envelope_completed" | "envelope_expired" | "envelope_declined"
  | "expired" | "already_signed" | "already_declined" | "not_your_turn";

export function signerGate(input: {
  envelope: { status: string; expires_at: string; order_mode: string };
  signer: { status: string; order_idx: number };
  peers: readonly { order_idx: number; status: string }[];
  now: Date;
}): { ok: true } | { ok: false; code: GateProblem; expire?: boolean } {
  const { envelope, signer } = input;
  if (FINAL_ENVELOPE.has(envelope.status)) return { ok: false, code: `envelope_${envelope.status}` as GateProblem };
  if (new Date(envelope.expires_at).getTime() < input.now.getTime()) return { ok: false, code: "expired", expire: true };
  if (FINAL_SIGNER.has(signer.status)) return { ok: false, code: `already_${signer.status}` as GateProblem };
  if (envelope.order_mode === "sequential") {
    const prior = input.peers.filter((p) => p.order_idx < signer.order_idx);
    if (!prior.every((p) => p.status === "signed")) return { ok: false, code: "not_your_turn" };
  }
  return { ok: true };
}

/** Състоянието на заявката следва само от сървърните статуси на подписващите. */
export function nextEnvelopeStatus(signers: readonly { status: string }[]): "declined" | "completed" | "in_progress" {
  if (signers.some((s) => s.status === "declined")) return "declined";
  if (signers.length > 0 && signers.every((s) => s.status === "signed")) return "completed";
  return "in_progress";
}

export const AUDIT_EVENT_TYPES = [
  "envelope_created", "signer_viewed", "otp_sent", "otp_verified", "otp_failed",
  "signed", "declined", "expired", "cancelled", "envelope_completed",
] as const;

export interface CertificateInput {
  envelope: { id: string; title: string; status: string; created_at: string; completed_at: string | null; order_mode: string };
  documentSha256: string;
  signers: readonly {
    id: string; name: string; role: string | null; order_idx: number; status: string;
    signed_at: string | null; declined_at: string | null; signature_method: string | null;
    signature_name: string | null; ses_equivalence_text_version: string | null;
  }[];
  events: readonly { event_type: string; signer_id: string | null; created_at: string; metadata?: unknown }[];
  issuedAt: string;
}

/**
 * Одитен сертификат: САМО факти от сървъра. Без имейли, OTP хешове, токени,
 * IP хешове, ЕГН/ЕИК или изображения на подписа.
 */
export async function buildAuditCertificate(input: CertificateInput) {
  const safeMeta = (m: unknown) => {
    if (!m || typeof m !== "object") return undefined;
    const o = m as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of ["result", "signature_method", "document_sha256"]) if (k in o) out[k] = o[k];
    return Object.keys(out).length ? out : undefined;
  };
  const body = {
    evidence_version: DTRUST_EVIDENCE_VERSION,
    signature_level: DTRUST_SIGNATURE_LEVEL,
    limitations: [
      "Обикновен електронен подпис; не е квалифициран или усъвършенстван електронен подпис.",
      "Потвърждението с код доказва достъп до имейл адреса към момента на действието, не самоличност.",
      "Подписите са визуализирани в PDF копието; не са криптографски вградени в PDF файла.",
    ],
    envelope: {
      id: input.envelope.id,
      title: input.envelope.title,
      status: input.envelope.status,
      order_mode: input.envelope.order_mode,
      created_at: input.envelope.created_at,
      completed_at: input.envelope.completed_at,
    },
    document_sha256: input.documentSha256,
    signers: [...input.signers].sort((a, b) => a.order_idx - b.order_idx).map((s) => ({
      id: s.id, name: s.name, role: s.role, order: s.order_idx, status: s.status,
      signed_at: s.signed_at, declined_at: s.declined_at,
      method: s.signature_method, typed_name: s.signature_name,
      identification: "email_otp",
      consent_text_version: s.ses_equivalence_text_version,
    })),
    events: [...input.events]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ type: e.event_type, signer_id: e.signer_id, at: e.created_at, details: safeMeta(e.metadata) })),
    issued_at: input.issuedAt,
  };
  const certificate_sha256 = await sha256Hex(canonicalJson(body));
  return { certificate: body, certificate_sha256 };
}
