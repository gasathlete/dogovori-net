import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consumeReviewGrant,
  issueReviewGrant,
  reviewGrantSecret,
  verifyReviewGrant,
} from "./review-grant.ts";

const SECRET = "test-review-grant-secret-1234";
const DIGEST = "a".repeat(64);

Deno.test("валиден пропуск минава", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: "u1",
    owner: "u1",
    contentDigest: DIGEST,
    operation: "review",
  });
  const v = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: "u1",
  });
  assertEquals(v.ok, true);
});

Deno.test("изтекъл пропуск се отхвърля", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
    now: Date.now() - 4_000_000,
    ttlSeconds: 60,
  });
  const v = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: null,
  });
  assertEquals(v.ok, false);
  assertEquals((v as { reason: string }).reason, "expired");
});

Deno.test("подменено съдържание се отхвърля", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
  });
  const v = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: "b".repeat(64),
    subject: null,
  });
  assertEquals((v as { reason: string }).reason, "content_mismatch");
});

Deno.test("пропуск на друг потребител не важи", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: "u1",
    owner: "u1",
    contentDigest: DIGEST,
    operation: "review",
  });
  const other = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: "u2",
  });
  assertEquals((other as { reason: string }).reason, "subject_mismatch");
  const anon = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: null,
  });
  assertEquals((anon as { reason: string }).reason, "subject_mismatch");
});

Deno.test("подправен подпис се отхвърля", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
  });
  const tampered = { payload: { ...g.payload, operation: "other" }, signature: g.signature };
  const v = await verifyReviewGrant({
    grant: tampered,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: null,
  });
  assertEquals((v as { reason: string }).reason, "bad_signature");
});

Deno.test("липсващ ключ е недостъпност, не разрешение", async () => {
  const v = await verifyReviewGrant({
    grant: { payload: {}, signature: "x" },
    secret: null,
    contentDigest: DIGEST,
    subject: null,
  });
  assertEquals((v as { reason: string }).reason, "grant_unavailable");
  assertEquals(reviewGrantSecret({ get: () => undefined }), null);
  assertEquals(reviewGrantSecret({ get: () => "short" }), null);
});

Deno.test("nonce се консумира еднократно", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
  });
  const seen = new Set<string>();
  const rl = (key: string) => Promise.resolve({ ok: !seen.has(key) && !!seen.add(key) });
  assertEquals((await consumeReviewGrant(rl, g.payload)).ok, true);
  const second = await consumeReviewGrant(rl, g.payload);
  assertEquals(second.ok, false);
  assertEquals(second.reason, "replayed");
});
