import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consumeReviewGrantDurable,
  issueGrantForGeneratedContent,
  issueReviewGrant,
  reviewContentDigest,
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

Deno.test("чужд собственик се отхвърля дори при съвпадащ субект", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: "u1",
    owner: "owner-x",
    contentDigest: DIGEST,
    operation: "review-document",
  });
  const v = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: "u1",
    expectedOwner: "u1",
  });
  assertEquals((v as { reason: string }).reason, "owner_mismatch");
});

Deno.test("грешна операция и грешно предназначение се отхвърлят", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: "u1",
    owner: "u1",
    contentDigest: DIGEST,
    operation: "other-operation",
  });
  const v = await verifyReviewGrant({
    grant: g,
    secret: SECRET,
    contentDigest: DIGEST,
    subject: "u1",
    expectedOperation: "review-document",
  });
  assertEquals((v as { reason: string }).reason, "operation_mismatch");

  const wrongAud = await verifyReviewGrant({
    grant: { payload: { ...g.payload, aud: "other" }, signature: g.signature },
    secret: SECRET,
    contentDigest: DIGEST,
    subject: "u1",
  });
  assertEquals((wrongAud as { reason: string }).reason, "bad_signature");
});

Deno.test("друга версия на пропуска не се приема", async () => {
  const v = await verifyReviewGrant({
    grant: {
      payload: {
        v: 2,
        aud: "review-document",
        sub: null,
        owner: null,
        content_digest: DIGEST,
        operation: "review-document",
        nonce: "n",
        issued_at: 1,
        expires_at: 9_999_999_999,
      },
      signature: "x",
    },
    secret: SECRET,
    contentDigest: DIGEST,
    subject: null,
  });
  assertEquals((v as { reason: string }).reason, "wrong_version");
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

Deno.test("издаване от сървъра иска ключ, собственик и реално съдържание", async () => {
  assertEquals(
    await issueGrantForGeneratedContent({
      secret: null,
      ownerId: "u1",
      documentText: "текст",
    }),
    null,
  );
  assertEquals(
    await issueGrantForGeneratedContent({
      secret: SECRET,
      ownerId: null,
      documentText: "текст",
    }),
    null,
  );
  assertEquals(
    await issueGrantForGeneratedContent({
      secret: SECRET,
      ownerId: "u1",
      documentText: "   \n  ",
    }),
    null,
  );
  const g = await issueGrantForGeneratedContent({
    secret: SECRET,
    ownerId: "u1",
    documentText: "ДОГОВОР\n\nЧл. 1",
  });
  assertEquals(g?.payload.aud, "review-document");
  assertEquals(g?.payload.owner, "u1");
  assertEquals(g?.payload.content_digest, await reviewContentDigest("ДОГОВОР\n\nЧл. 1"));
});

Deno.test("отпечатъкът на съдържанието е чувствителен към регистър, но не към празнини", async () => {
  assertEquals(
    await reviewContentDigest("Ред 1\nРед 2"),
    await reviewContentDigest(" Ред 1 \r\n Ред 2 "),
  );
  const other = await reviewContentDigest("ред 1\nРед 2");
  assertEquals(other === await reviewContentDigest("Ред 1\nРед 2"), false);
});

Deno.test("nonce се консумира трайно и еднократно", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
  });
  const seen = new Set<string>();
  const db = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      const nonce = String(args.p_nonce);
      if (seen.has(nonce)) {
        return Promise.resolve({ data: { ok: false, reason: "replayed" }, error: null });
      }
      seen.add(nonce);
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  };
  assertEquals((await consumeReviewGrantDurable(db, g.payload)).ok, true);
  const second = await consumeReviewGrantDurable(db, g.payload);
  assertEquals(second.ok, false);
  assertEquals(second.reason, "replayed");
});

Deno.test("грешка в базата при консумация НЕ е повторение и НЕ е разрешение", async () => {
  const g = await issueReviewGrant({
    secret: SECRET,
    subject: null,
    owner: null,
    contentDigest: DIGEST,
    operation: "review",
  });
  const db = {
    rpc: () => Promise.resolve({ data: null, error: { message: "db down" } }),
  };
  const r = await consumeReviewGrantDurable(db, g.payload);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "grant_unavailable");
});
