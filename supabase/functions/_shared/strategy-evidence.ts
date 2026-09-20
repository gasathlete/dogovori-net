/**
 * ПОДПИСАН ДОКАЗАТЕЛСТВЕН ПЛИК НА ПРЕГОВОРНАТА СТРАТЕГИЯ.
 *
 * Пликът е обвързан със съдържанието (дайджест на стратегията), с анализа и с
 * потребителя, с точните източници (chunk_id + версия/дайджест), с версията на
 * политиката, с момента на изготвяне и с ограничен срок на валидност. Подписът
 * е HMAC-SHA256 със сървърен ключ, така че браузърът не може да го подправи или
 * да си „изпише“ валидност.
 *
 * Стар запис без валиден подпис НЕ се показва като текущ резултат.
 */

export const STRATEGY_EVIDENCE_VERSION = "v2";
export const STRATEGY_POLICY_VERSION = "legal-gate-2026-09";
/** Горен предел на валидност: пликът не е безсрочен пропуск. */
export const STRATEGY_EVIDENCE_TTL_S = 30 * 24 * 3600;

export interface StrategySourceRef {
  chunk_id: string;
  short_code: string;
  version: string;
  snapshot_digest?: string | null;
}

export interface StrategyEvidence {
  version: string;
  analysis_id: string;
  user_id: string;
  strategy_digest: string;
  policy_version: string;
  sources: StrategySourceRef[];
  generated_at: string;
  expires_at: string;
  signature: string;
}

export interface StrategyEnvelope {
  __evidence?: unknown;
  [key: string]: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Детерминирана канонична форма (сортирани ключове) за дайджест/подпис. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => k !== "__evidence").sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(buf);
}

/** Само сървърът разполага с ключа; липсата му е недостъпност, не разрешение. */
export function strategySigningKey(env: { get(name: string): string | undefined }): string | null {
  const explicit = env.get("STRATEGY_EVIDENCE_SECRET");
  if (isNonEmptyString(explicit)) return explicit;
  const service = env.get("SUPABASE_SERVICE_ROLE_KEY");
  return isNonEmptyString(service) ? service : null;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return toHex(sig);
}

function signedPayload(e: Omit<StrategyEvidence, "signature">): string {
  return canonicalJson({
    version: e.version,
    analysis_id: e.analysis_id,
    user_id: e.user_id,
    strategy_digest: e.strategy_digest,
    policy_version: e.policy_version,
    sources: e.sources,
    generated_at: e.generated_at,
    expires_at: e.expires_at,
  });
}

export interface BuildEvidenceInput {
  analysisId: string;
  userId: string;
  strategy: Record<string, unknown>;
  sources: StrategySourceRef[];
  signingKey: string;
  now?: Date;
  ttlSeconds?: number;
  policyVersion?: string;
}

/** Създава плика заедно с подписа. Празен списък източници е отказ. */
export async function buildStrategyEvidence(
  input: BuildEvidenceInput,
): Promise<StrategyEvidence | null> {
  if (!isNonEmptyString(input.analysisId) || !isNonEmptyString(input.userId)) return null;
  if (!Array.isArray(input.sources) || input.sources.length === 0) return null;
  if (!isNonEmptyString(input.signingKey)) return null;
  const now = input.now ?? new Date();
  const ttl = Math.min(
    Math.max(Math.floor(input.ttlSeconds ?? STRATEGY_EVIDENCE_TTL_S), 60),
    STRATEGY_EVIDENCE_TTL_S,
  );
  const base: Omit<StrategyEvidence, "signature"> = {
    version: STRATEGY_EVIDENCE_VERSION,
    analysis_id: input.analysisId,
    user_id: input.userId,
    strategy_digest: await sha256Hex(canonicalJson(input.strategy)),
    policy_version: input.policyVersion ?? STRATEGY_POLICY_VERSION,
    sources: input.sources.map((s) => ({
      chunk_id: String(s.chunk_id),
      short_code: String(s.short_code ?? ""),
      version: String(s.version ?? ""),
      snapshot_digest: s.snapshot_digest ?? null,
    })),
    generated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
  return { ...base, signature: await hmacHex(input.signingKey, signedPayload(base)) };
}

export type StrategyVerifyReason =
  | "ok"
  | "missing_envelope"
  | "version_mismatch"
  | "malformed"
  | "analysis_mismatch"
  | "user_mismatch"
  | "content_mismatch"
  | "policy_mismatch"
  | "expired"
  | "bad_signature"
  | "stale_sources"
  | "signing_unavailable";

export interface VerifyEvidenceInput {
  envelope: unknown;
  analysisId: string;
  userId: string;
  signingKey: string | null;
  /** Актуални одобрени източници: chunk_id -> версия. */
  currentSources?: Map<string, string> | null;
  now?: Date;
  policyVersion?: string;
}

/** Строга проверка: всяко несъответствие е скриване, не „почти валиден“ плик. */
export async function verifyStrategyEvidence(
  input: VerifyEvidenceInput,
): Promise<{ ok: boolean; reason: StrategyVerifyReason; evidence?: StrategyEvidence }> {
  if (!isNonEmptyString(input.signingKey)) return { ok: false, reason: "signing_unavailable" };
  const env = input.envelope;
  if (!env || typeof env !== "object") return { ok: false, reason: "missing_envelope" };
  const raw = (env as StrategyEnvelope).__evidence;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "missing_envelope" };
  const e = raw as Partial<StrategyEvidence>;
  if (e.version !== STRATEGY_EVIDENCE_VERSION) return { ok: false, reason: "version_mismatch" };
  if (
    !isNonEmptyString(e.analysis_id) || !isNonEmptyString(e.user_id) ||
    !isNonEmptyString(e.strategy_digest) || !isNonEmptyString(e.policy_version) ||
    !isNonEmptyString(e.generated_at) || !isNonEmptyString(e.expires_at) ||
    !isNonEmptyString(e.signature) || !Array.isArray(e.sources) || e.sources.length === 0
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (
    !e.sources.every((s) =>
      s && typeof s === "object" && isNonEmptyString((s as StrategySourceRef).chunk_id) &&
      isNonEmptyString((s as StrategySourceRef).version)
    )
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (e.analysis_id !== input.analysisId) return { ok: false, reason: "analysis_mismatch" };
  if (e.user_id !== input.userId) return { ok: false, reason: "user_mismatch" };
  if (e.policy_version !== (input.policyVersion ?? STRATEGY_POLICY_VERSION)) {
    return { ok: false, reason: "policy_mismatch" };
  }
  const now = input.now ?? new Date();
  const exp = Date.parse(e.expires_at);
  const gen = Date.parse(e.generated_at);
  if (Number.isNaN(exp) || Number.isNaN(gen)) return { ok: false, reason: "malformed" };
  if (exp <= now.getTime()) return { ok: false, reason: "expired" };
  if (exp - gen > STRATEGY_EVIDENCE_TTL_S * 1000) return { ok: false, reason: "malformed" };

  const digest = await sha256Hex(canonicalJson(env));
  if (digest !== e.strategy_digest) return { ok: false, reason: "content_mismatch" };

  const expected = await hmacHex(
    input.signingKey,
    signedPayload(e as Omit<StrategyEvidence, "signature">),
  );
  if (expected.length !== e.signature.length) return { ok: false, reason: "bad_signature" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ e.signature.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: "bad_signature" };

  if (input.currentSources) {
    const fresh = e.sources.every((s) =>
      input.currentSources!.get(s.chunk_id) === s.version
    );
    if (!fresh) return { ok: false, reason: "stale_sources" };
  }
  return { ok: true, reason: "ok", evidence: e as StrategyEvidence };
}
