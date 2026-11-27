import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizePersistedReview,
  normalizeDocumentRef,
  reviewDenial,
} from "./review-authorization.ts";
import { reviewContentDigest } from "../_shared/review-grant.ts";

const DOC = "11111111-1111-4111-8111-111111111111";
const TEXT = "ДОГОВОР ЗА ИЗРАБОТКА\n\nЧл. 1 Предмет";

function load(doc: { ownerId: string | null; text: string | null }) {
  return () => Promise.resolve({ found: true as const, doc });
}

Deno.test("идентификаторът на документа се разчита строго", () => {
  assertEquals(normalizeDocumentRef(DOC, null), { documentId: DOC, versionNo: null });
  assertEquals(normalizeDocumentRef(DOC, 3), { documentId: DOC, versionNo: 3 });
  assertEquals(normalizeDocumentRef("не-uuid", null), null);
  assertEquals(normalizeDocumentRef(DOC, 0), null);
  assertEquals(normalizeDocumentRef(DOC, "abc"), null);
});

Deno.test("проверен собственик на точния документ е оторизиран", async () => {
  const v = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest(TEXT),
    load: load({ ownerId: "u-1", text: TEXT }),
    digestOf: reviewContentDigest,
  });
  assertEquals(v, { ok: true, ownerId: "u-1" });
});

Deno.test("само вход в профила НЕ е достатъчен — чужд документ се отказва", async () => {
  const v = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-2",
    contentDigest: await reviewContentDigest(TEXT),
    load: load({ ownerId: "u-1", text: TEXT }),
    digestOf: reviewContentDigest,
  });
  assertEquals(v, { ok: false, reason: "not_owner" });
  assertEquals(reviewDenial("not_owner").status, 403);
});

Deno.test("подменен текст срещу собствен документ се отказва", async () => {
  const v = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest("ДРУГ ДОКУМЕНТ"),
    load: load({ ownerId: "u-1", text: TEXT }),
    digestOf: reviewContentDigest,
  });
  assertEquals(v, { ok: false, reason: "content_mismatch" });
  assertEquals(reviewDenial("content_mismatch").status, 409);
});

Deno.test("анонимен посетител не може да ползва пътя през запазен документ", async () => {
  const v = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: null,
    contentDigest: await reviewContentDigest(TEXT),
    load: () => {
      throw new Error("не трябва да се чете");
    },
    digestOf: reviewContentDigest,
  });
  assertEquals(v, { ok: false, reason: "not_owner" });
});

Deno.test("липсващ документ и грешка в базата са различни и никога не разрешават", async () => {
  const missing = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest(TEXT),
    load: () => Promise.resolve({ found: false as const }),
    digestOf: reviewContentDigest,
  });
  assertEquals(missing, { ok: false, reason: "not_found" });

  const broken = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest(TEXT),
    load: () => Promise.resolve({ error: true as const }),
    digestOf: reviewContentDigest,
  });
  assertEquals(broken, { ok: false, reason: "unavailable" });
  assertEquals(reviewDenial("unavailable").status, 503);

  const thrown = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest(TEXT),
    load: () => {
      throw new Error("db down");
    },
    digestOf: reviewContentDigest,
  });
  assertEquals(thrown, { ok: false, reason: "unavailable" });
});

Deno.test("празно съдържание никога не минава като съвпадение", async () => {
  const v = await authorizePersistedReview({
    documentId: DOC,
    versionNo: null,
    userId: "u-1",
    contentDigest: await reviewContentDigest(""),
    load: load({ ownerId: "u-1", text: "   " }),
    digestOf: reviewContentDigest,
  });
  assertEquals(v, { ok: false, reason: "content_mismatch" });
});

Deno.test("липсваща оторизация и невалиден пропуск не са недостъпност", () => {
  assertEquals(reviewDenial("missing_authorization").code, "unauthorized");
  assertEquals(reviewDenial("grant_invalid").status, 403);
  assertEquals(reviewDenial("grant_replayed").status, 409);
  assertEquals(reviewDenial("grant_unavailable").status, 503);
  assertEquals(reviewDenial("invalid_request").status, 400);
});
