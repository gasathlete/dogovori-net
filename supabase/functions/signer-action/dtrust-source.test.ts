import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const before = (src: string, a: string, b: string) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert(i > 0 && j > i, `${a} трябва да е преди ${b}`);
};

Deno.test("signer-action: token format, version lock before any action", async () => {
  const s = await read("./index.ts");
  assert(s.includes("!SIGN_TOKEN_RE.test(token)"));
  before(s, "checkDocumentLock(env)", 'if (action === "send_otp")');
});

Deno.test("signer-action: sign confirms exact hash before OTP and storage", async () => {
  const s = await read("./index.ts");
  const sign = s.slice(s.indexOf('if (action === "sign")'));
  before(sign, "safeEqualHex(seen.toLowerCase(), documentSha256)", "consumeAttemptAndVerify(");
  before(sign, "consumeAttemptAndVerify(", 'storage.from("qes-signatures")');
});

Deno.test("signer-action: decline requires OTP and is atomic", async () => {
  const s = await read("./index.ts");
  const d = s.slice(s.indexOf('if (action === "decline")'));
  before(d, "consumeAttemptAndVerify(", 'status: "declined", declined_at');
  assert(d.includes('.eq("otp_code_hash", hashAtCheck)'));
  assert(d.includes('.not("status", "in", "(signed,declined)")'));
});

Deno.test("signer-action: envelope transition guarded; completion once", async () => {
  const s = await read("./index.ts");
  assert(s.includes('.in("status", ["pending", "in_progress"]).select("id")'));
  assert(s.includes('newStatus === "completed" && transitioned'));
  assert(!s.includes("metadata: { email: signer.email }"));
});

Deno.test("owner action: auth, uniform not_found, guarded revoke", async () => {
  const s = await read("../signing-owner-action/index.ts");
  before(s, "admin.auth.getUser(", 'from("signing_requests")');
  assert(s.includes('return json({ error: "not_found" }, 404);'));
  assert(s.includes('.in("status", ["draft", "pending", "in_progress"])'));
  assert(!s.includes("signing_request_signers\").update({ status"));
});

Deno.test("create-signing-request: ownership of linked docs and hash lock", async () => {
  const s = await read("../create-signing-request/index.ts");
  assert(s.includes("sd.user_id !== userId") && s.includes("uc.user_id !== userId"));
  before(s, "documentDigest(cleanTitle, document_snapshot)", 'from("signing_requests").insert');
});

Deno.test("get-signing-request: no metadata/owner/email/ip leakage", async () => {
  const s = await read("../get-signing-request/index.ts");
  assert(!s.includes("owner_id, created_at\""));
  assert(s.includes("const { metadata: _meta, ...publicEnv } = env;"));
  assert(!s.includes("signer_ip_hash\")"));
});
