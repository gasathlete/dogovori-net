import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  type AttemptStore, BodyTooLargeError, consumeAttemptAndVerify, hashOtpV2, OTP_MAX_ATTEMPTS, OtpConfigError,
  otpSecret, readBoundedJson, SIGNER_BODY_MAX_BYTES, timingSafeEqual, verifyOtp,
} from "./signing-otp.ts";

const SECRET = "t".repeat(48);
const SIGNER = "ffffffff-0000-4000-8000-000000000006";

async function v1(code: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code + "|" + SIGNER));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function memStore(hash: string, attempts = 0): AttemptStore & { row: { otp_attempts: number; otp_code_hash: string; otp_expires_at: string } } {
  const row = { otp_attempts: attempts, otp_code_hash: hash, otp_expires_at: new Date(Date.now() + 600_000).toISOString() };
  return {
    row,
    read: async () => { await Promise.resolve(); return { ...row }; },
    casAttempts: async (expected, expectedHash) => {
      await Promise.resolve();
      if (row.otp_attempts !== expected || row.otp_code_hash !== expectedHash) return false;
      row.otp_attempts = expected + 1;
      return true;
    },
  };
}

Deno.test("v2 HMAC: valid code passes, wrong code fails, secret required (fail closed)", async () => {
  const h = await hashOtpV2("123456", SIGNER, SECRET);
  assert(h.startsWith("v2:"));
  assert(await verifyOtp("123456", SIGNER, h, SECRET));
  assert(!(await verifyOtp("123457", SIGNER, h, SECRET)));
  assert(!(await verifyOtp("123456", SIGNER, h, "x".repeat(48))));
  await assertRejects(() => verifyOtp("123456", SIGNER, h, null), OtpConfigError);
  assert(() => otpSecret({ get: () => "short" }));
  let threw = false;
  try { otpSecret({ get: () => undefined }); } catch (e) { threw = e instanceof OtpConfigError; }
  assert(threw);
});

Deno.test("legacy v1 codes still verify until they expire; malformed input rejected", async () => {
  assert(await verifyOtp("654321", SIGNER, await v1("654321"), null));
  assert(!(await verifyOtp("654320", SIGNER, await v1("654321"), null)));
  assert(!(await verifyOtp("12345", SIGNER, await v1("12345"), null)));
  assert(!(await verifyOtp({} as unknown, SIGNER, await v1("654321"), null)));
});

Deno.test("timing-safe compare", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
});

Deno.test("concurrent wrong guesses cannot exceed the attempt cap", async () => {
  const store = memStore(await hashOtpV2("111111", SIGNER, SECRET));
  const guesses = Array.from({ length: 40 }, (_, i) => String(200000 + i));
  const results = await Promise.all(guesses.map((g) => consumeAttemptAndVerify(store, SIGNER, g, SECRET)));
  assertEquals(store.row.otp_attempts, OTP_MAX_ATTEMPTS);
  assertEquals(results.filter((r) => r === "otp_invalid").length, OTP_MAX_ATTEMPTS);
  assert(results.filter((r) => r === "otp_locked").length >= 40 - OTP_MAX_ATTEMPTS);
  // The correct code is also refused once locked (replay after lock).
  assertEquals(await consumeAttemptAndVerify(store, SIGNER, "111111", SECRET), "otp_locked");
});

Deno.test("valid normal path; expired and missing codes refused", async () => {
  const store = memStore(await hashOtpV2("222222", SIGNER, SECRET));
  assertEquals(await consumeAttemptAndVerify(store, SIGNER, "222222", SECRET), "ok");
  store.row.otp_expires_at = new Date(Date.now() - 1).toISOString();
  assertEquals(await consumeAttemptAndVerify(store, SIGNER, "222222", SECRET), "otp_invalid");
  const empty: AttemptStore = { read: async () => ({ otp_attempts: 0, otp_code_hash: null, otp_expires_at: null }), casAttempts: async () => true };
  assertEquals(await consumeAttemptAndVerify(empty, SIGNER, "222222", SECRET), "otp_required");
});

Deno.test("oversized unauthenticated body is rejected before JSON/base64 decode", async () => {
  const big = new Request("https://x/", { method: "POST", headers: { "content-length": String(SIGNER_BODY_MAX_BYTES + 1) }, body: "{}" });
  await assertRejects(() => readBoundedJson(big, SIGNER_BODY_MAX_BYTES), BodyTooLargeError);
  // Streamed without a trustworthy length header.
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(1024)); c.close(); } });
  await assertRejects(() => readBoundedJson(new Request("https://x/", { method: "POST", body: stream }), 2048), BodyTooLargeError);
  const ok = await readBoundedJson(new Request("https://x/", { method: "POST", body: '{"token":"t","action":"send_otp"}' }), 1024);
  assertEquals((ok as { action: string }).action, "send_otp");
});
