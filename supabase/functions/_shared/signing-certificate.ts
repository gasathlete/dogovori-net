/**
 * Зарежда сървърните факти за заявка и издава одитния сертификат DTrust Basic.
 * Използва се от подписващия (по токен) и от собственика (по сесия).
 */
import { buildAuditCertificate, checkDocumentLock } from "./signing-evidence.ts";

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export const SIGN_TOKEN_RE = /^[0-9a-f]{64}$/;

export async function loadAuditCertificate(admin: Db, requestId: string, now = new Date()) {
  const { data: env } = await admin.from("signing_requests")
    .select("id, title, document_snapshot, metadata, status, order_mode, created_at, completed_at")
    .eq("id", requestId).maybeSingle();
  if (!env) return { ok: false as const, code: "not_found" };
  const lock = await checkDocumentLock(env);
  if (!lock.ok) return { ok: false as const, code: lock.code };
  const { data: signers } = await admin.from("signing_request_signers")
    .select("id, name, role, order_idx, status, signed_at, declined_at, signature_method, signature_name, ses_equivalence_text_version")
    .eq("request_id", requestId).order("order_idx");
  const { data: events } = await admin.from("signing_audit_events")
    .select("event_type, signer_id, created_at, metadata")
    .eq("request_id", requestId).order("created_at");
  const cert = await buildAuditCertificate({
    envelope: env,
    documentSha256: lock.digest,
    signers: signers ?? [],
    events: events ?? [],
    issuedAt: now.toISOString(),
  });
  return { ok: true as const, ...cert };
}
