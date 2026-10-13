import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAuditCertificate, canonicalJson, checkDocumentLock, documentDigest, DTRUST_EVIDENCE_VERSION,
  nextEnvelopeStatus, safeEqualHex, signerGate,
} from "./signing-evidence.ts";

// Фиктивни участници и документ — без реални лични данни.
const SNAP = { blocks: [{ type: "p", text: "Синтетичен договор за тест." }] };
const lockedEnv = async (snap: unknown = SNAP, title = "Тест") => ({
  title, document_snapshot: snap,
  metadata: { evidence_version: DTRUST_EVIDENCE_VERSION, document_sha256: await documentDigest(title, snap) },
});

Deno.test("canonical JSON is key-order independent", () => {
  assertEquals(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

Deno.test("version lock: unchanged document passes", async () => {
  const r = await checkDocumentLock(await lockedEnv());
  assert(r.ok);
});

Deno.test("version lock: modified content or title invalidates all invites", async () => {
  const env = await lockedEnv();
  assertEquals(await checkDocumentLock({ ...env, document_snapshot: { blocks: [{ type: "p", text: "Подменен." }] } }), { ok: false, code: "document_changed" });
  assertEquals(await checkDocumentLock({ ...env, title: "Друго" }), { ok: false, code: "document_changed" });
});

Deno.test("version lock: legacy/forged metadata fails closed", async () => {
  const env = await lockedEnv();
  assertEquals((await checkDocumentLock({ ...env, metadata: null })), { ok: false, code: "document_unlocked" });
  assertEquals((await checkDocumentLock({ ...env, metadata: { document_sha256: "zz" } })), { ok: false, code: "document_unlocked" });
});

Deno.test("safeEqualHex", () => {
  assert(safeEqualHex("ab".repeat(32), "ab".repeat(32)));
  assert(!safeEqualHex("ab".repeat(32), "ac".repeat(32)));
  assert(!safeEqualHex("ab", "abab"));
});

const base = { envelope: { status: "pending", expires_at: "2026-12-01T00:00:00Z", order_mode: "parallel" }, signer: { status: "otp_sent", order_idx: 1 }, peers: [{ order_idx: 0, status: "pending" }, { order_idx: 1, status: "otp_sent" }], now: new Date("2026-10-14T00:00:00Z") };

Deno.test("gate: revoked, completed, declined, expired, already acted, turn order", () => {
  assert(signerGate(base).ok);
  for (const st of ["cancelled", "completed", "declined", "expired"]) {
    assertEquals(signerGate({ ...base, envelope: { ...base.envelope, status: st } }), { ok: false, code: `envelope_${st}` } as never);
  }
  assertEquals(signerGate({ ...base, envelope: { ...base.envelope, expires_at: "2026-10-01T00:00:00Z" } }), { ok: false, code: "expired", expire: true });
  assertEquals(signerGate({ ...base, signer: { status: "signed", order_idx: 1 } }), { ok: false, code: "already_signed" });
  assertEquals(signerGate({ ...base, envelope: { ...base.envelope, order_mode: "sequential" } }), { ok: false, code: "not_your_turn" });
});

Deno.test("envelope status derives only from server signer states", () => {
  assertEquals(nextEnvelopeStatus([{ status: "signed" }, { status: "signed" }]), "completed");
  assertEquals(nextEnvelopeStatus([{ status: "signed" }, { status: "declined" }]), "declined");
  assertEquals(nextEnvelopeStatus([{ status: "signed" }, { status: "viewed" }]), "in_progress");
  assertEquals(nextEnvelopeStatus([]), "in_progress");
});

Deno.test("certificate: deterministic, hash-bound, no secrets/PII fields", async () => {
  const input = {
    envelope: { id: "e1", title: "Тест", status: "completed", created_at: "2026-10-14T00:00:00Z", completed_at: "2026-10-14T01:00:00Z", order_mode: "parallel" },
    documentSha256: "a".repeat(64),
    signers: [{ id: "s1", name: "Участник А", role: null, order_idx: 0, status: "signed", signed_at: "2026-10-14T00:30:00Z", declined_at: null, signature_method: "drawn", signature_name: "Участник А", ses_equivalence_text_version: "2026-06-10" }],
    events: [{ event_type: "signed", signer_id: "s1", created_at: "2026-10-14T00:30:00Z", metadata: { email: "x@example.invalid", otp: "123456", ip_hash: "h", document_sha256: "a".repeat(64) } }],
    issuedAt: "2026-10-14T02:00:00Z",
  };
  const a = await buildAuditCertificate(input);
  const b = await buildAuditCertificate(input);
  assertEquals(a.certificate_sha256, b.certificate_sha256);
  const text = JSON.stringify(a.certificate);
  for (const bad of ["example.invalid", "123456", "ip_hash", "otp_code"]) assert(!text.includes(bad), bad);
  assertEquals(a.certificate.signature_level, "simple_electronic_signature");
  assert(!/PAdES|квалифициран подпис\b/.test(text.replace("не е квалифициран", "")));
  const changed = await buildAuditCertificate({ ...input, documentSha256: "b".repeat(64) });
  assertNotEquals(changed.certificate_sha256, a.certificate_sha256);
});
