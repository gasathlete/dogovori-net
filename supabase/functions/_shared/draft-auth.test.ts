// Инварианти за достъп до анонимните чернови.
//
// Ключовото свойство: след присвояване токенът НЕ оторизира нищо — единствено
// JWT на собственика. Преди присвояване — единствено верният токен.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashToken } from "./draft-token.ts";
import {
  decideClaim,
  decideSyncWrite,
  hasRestorableContent,
  isCreateRequest,
  ownerUpdateAfterTransfer,
  REASON_STATUS,
  rowAfterTransfer,
  safeLogContext,
  type DraftAuthRow,
} from "./draft-auth.ts";

const NOW = Date.parse("2026-09-05T10:00:00Z");
const FUTURE = new Date(NOW + 60 * 60 * 1000).toISOString();
const PAST = new Date(NOW - 60 * 1000).toISOString();
const TOKEN = "correct-token-abcdefghijklmnop";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

async function unclaimed(overrides: Partial<DraftAuthRow> = {}): Promise<DraftAuthRow> {
  return { token_hash: await hashToken(TOKEN), claimed_by: null, expires_at: FUTURE, saved_doc_id: null, ...overrides };
}
async function claimed(overrides: Partial<DraftAuthRow> = {}): Promise<DraftAuthRow> {
  return { ...(await unclaimed()), claimed_by: OWNER, ...overrides };
}

/* ------------------------------- draft-sync ------------------------------- */

Deno.test("sync: непотърсена чернова се пише с верния токен и се отказва без него", async () => {
  const row = await unclaimed();
  const good = decideSyncWrite({ row, tokenHash: await hashToken(TOKEN), userId: null, now: NOW });
  assertEquals(good, { ok: true, mode: "anonymous", transferred: false });

  const wrong = decideSyncWrite({ row, tokenHash: await hashToken("wrong-token-xxxxxxxxxxxxxxxx"), userId: null, now: NOW });
  assertEquals(wrong, { ok: false, reason: "invalid_token" });

  const missing = decideSyncWrite({ row, tokenHash: null, userId: null, now: NOW });
  assertEquals(missing, { ok: false, reason: "invalid_token" });

  // JWT без токен не отваря непотърсена чернова — тя още не е ничия.
  const jwtOnly = decideSyncWrite({ row, tokenHash: null, userId: OWNER, now: NOW });
  assertEquals(jwtOnly, { ok: false, reason: "invalid_token" });
});

Deno.test("sync: след присвояване токенът вече не оторизира запис", async () => {
  const row = await claimed();
  const tokenOnly = decideSyncWrite({ row, tokenHash: await hashToken(TOKEN), userId: null, now: NOW });
  assertEquals(tokenOnly, { ok: false, reason: "unauthorized" });
});

Deno.test("sync: собственикът обновява присвоената недовършена чернова само с JWT", async () => {
  const row = await claimed();
  const owner = decideSyncWrite({ row, tokenHash: null, userId: OWNER, now: NOW });
  assertEquals(owner, { ok: true, mode: "owner", transferred: false });
  // Верен токен + собственик също минава (токенът просто се игнорира).
  const ownerWithToken = decideSyncWrite({ row, tokenHash: await hashToken(TOKEN), userId: OWNER, now: NOW });
  assertEquals(ownerWithToken, { ok: true, mode: "owner", transferred: false });
});

Deno.test("sync: друг потребител не може да пише по чужда чернова — дори с верния токен", async () => {
  const row = await claimed();
  const other = decideSyncWrite({ row, tokenHash: await hashToken(TOKEN), userId: OTHER, now: NOW });
  assertEquals(other, { ok: false, reason: "different_owner" });
});

Deno.test("sync: липсваща или изтекла чернова е типизиран отказ, не нова чернова", async () => {
  const none = decideSyncWrite({ row: null, tokenHash: await hashToken(TOKEN), userId: null, now: NOW });
  assertEquals(none, { ok: false, reason: "expired" });
  const expired = decideSyncWrite({ row: await unclaimed({ expires_at: PAST }), tokenHash: await hashToken(TOKEN), userId: null, now: NOW });
  assertEquals(expired, { ok: false, reason: "expired" });
  const expiredOwner = decideSyncWrite({ row: await claimed({ expires_at: PAST }), tokenHash: null, userId: OWNER, now: NOW });
  assertEquals(expiredOwner, { ok: false, reason: "expired" });
  const badDate = decideSyncWrite({ row: await unclaimed({ expires_at: "not-a-date" }), tokenHash: await hashToken(TOKEN), userId: null, now: NOW });
  assertEquals(badDate, { ok: false, reason: "expired" });
});

Deno.test("sync: прехвърлена чернова се отбелязва, за да не приема съдържание", async () => {
  const row = await claimed({ saved_doc_id: "33333333-3333-4333-8333-333333333333" });
  const d = decideSyncWrite({ row, tokenHash: null, userId: OWNER, now: NOW });
  assertEquals(d, { ok: true, mode: "owner", transferred: true });
  const upd = ownerUpdateAfterTransfer({ route: "/wizard/it", step_idx: 3, expires_at: FUTURE });
  assertEquals(Object.keys(upd).sort(), ["expires_at", "route", "step_idx"]);
  assertFalse("payload" in upd);
});

/* ------------------------------ draft-claim ------------------------------- */

Deno.test("claim: без JWT е unauthorized, независимо от токена", async () => {
  const row = await unclaimed();
  assertEquals(decideClaim({ row, tokenHash: await hashToken(TOKEN), userId: null, now: NOW }), {
    ok: false,
    reason: "unauthorized",
  });
});

Deno.test("claim: непотърсена чернова се присвоява само с верния токен", async () => {
  const row = await unclaimed();
  assertEquals(decideClaim({ row, tokenHash: await hashToken(TOKEN), userId: OWNER, now: NOW }), {
    ok: true,
    idempotent: false,
  });
  assertEquals(decideClaim({ row, tokenHash: await hashToken("wrong-token-xxxxxxxxxxxxxxxx"), userId: OWNER, now: NOW }), {
    ok: false,
    reason: "invalid_token",
  });
  assertEquals(decideClaim({ row, tokenHash: null, userId: OWNER, now: NOW }), {
    ok: false,
    reason: "invalid_token",
  });
});

Deno.test("claim: същият собственик е идемпотентен; друг потребител е отказан", async () => {
  const row = await claimed();
  // Токенът след claim е ротиран и клиентът не го пази — собственикът минава без него.
  assertEquals(decideClaim({ row, tokenHash: null, userId: OWNER, now: NOW }), { ok: true, idempotent: true });
  // Друг потребител с (откраднат) верен токен — не разкриваме нищо освен „вече присвоена".
  assertEquals(decideClaim({ row, tokenHash: await hashToken(TOKEN), userId: OTHER, now: NOW }), {
    ok: false,
    reason: "already_claimed",
  });
});

Deno.test("claim: липсваща / изтекла чернова", async () => {
  assertEquals(decideClaim({ row: null, tokenHash: await hashToken(TOKEN), userId: OWNER, now: NOW }), {
    ok: false,
    reason: "expired",
  });
  assertEquals(
    decideClaim({ row: await unclaimed({ expires_at: PAST }), tokenHash: await hashToken(TOKEN), userId: OWNER, now: NOW }),
    { ok: false, reason: "expired" },
  );
});

Deno.test("всяка причина има HTTP статус, различен от 2xx", () => {
  for (const [reason, status] of Object.entries(REASON_STATUS)) {
    assert(status >= 400, `${reason} → ${status}`);
  }
  assertEquals(REASON_STATUS.unauthorized, 401);
  assertEquals(REASON_STATUS.rate_limited, 429);
  assertEquals(REASON_STATUS.already_claimed, 409);
});

/* ------------------------- Минимизация на данните ------------------------- */

Deno.test("след прехвърляне в черновата остават само статусни полета", async () => {
  const rotated = await hashToken("rotated-token-xxxxxxxxxxxxxxxxxx");
  const after = rowAfterTransfer("33333333-3333-4333-8333-333333333333", rotated);
  assertEquals(after.payload, {});
  assertEquals(after.has_result, true);
  assertEquals(after.saved_doc_id, "33333333-3333-4333-8333-333333333333");
  assertEquals(after.token_hash, rotated);
  assertEquals(Object.keys(after).sort(), ["has_result", "payload", "saved_doc_id", "token_hash"]);
});

Deno.test("hasRestorableContent различава празно от истинско съдържание", () => {
  assertFalse(hasRestorableContent(null));
  assertFalse(hasRestorableContent({}));
  assertFalse(hasRestorableContent({ answers: {}, meta: {} }));
  assert(hasRestorableContent({ answers: { subject: "услуга" } }));
  assert(hasRestorableContent({ result: { contract: {} } }));
  assert(hasRestorableContent({ meta: { stepIdx: 2 } }));
});

/* ------------------------------ Безопасен лог ----------------------------- */

Deno.test("логът никога не пропуска токени, съдържание или лични данни", () => {
  const ctx = safeLogContext({
    fn: "draft-claim",
    reason: "invalid_token",
    status: 403,
    claim_token: TOKEN,
    token_hash: "deadbeef",
    payload: { answers: { egn: "1234567890" } },
    answers: { name: "Иван Петров" },
    email: "ivan@example.com",
    name: "Иван Петров",
    address: "бул. България 1",
    route: "/wizard/it?doc=nda",
    draft_id: OWNER,
    user_id: OTHER,
    jwt: "eyJ...",
  });
  assertEquals(ctx, { fn: "draft-claim", reason: "invalid_token", status: 403 });
  const serialized = JSON.stringify(ctx);
  for (const forbidden of [TOKEN, "deadbeef", "1234567890", "Иван", "example.com", "България", OWNER, OTHER, "eyJ"]) {
    assertFalse(serialized.includes(forbidden), `логът съдържа „${forbidden}“`);
  }
});

Deno.test("създаване е разрешено само когато draft_id отсъства от тялото", async () => {
  // Отсъстващо свойство = изричен create.
  assert(isCreateRequest({}));
  assert(isCreateRequest({ draft_id: undefined }));
  assert(isCreateRequest({ flow: "wizard" }));
  // Подадена, но негодна стойност → НЕ е create (върви към invalid_request).
  assertFalse(isCreateRequest({ draft_id: null }));
  assertFalse(isCreateRequest({ draft_id: "" }));
  assertFalse(isCreateRequest({ draft_id: "   " }));
  assertFalse(isCreateRequest({ draft_id: "not-a-uuid" }));
  assertFalse(isCreateRequest({ draft_id: 123 }));
  assertFalse(isCreateRequest({ draft_id: "d1" }));
  // Подаден, но невалиден / изтекъл ред → отказ, а не нова чернова.
  const expired = await unclaimed({ expires_at: PAST });

  assertEquals(decideSyncWrite({ row: expired, tokenHash: await hashToken(TOKEN), userId: null, now: NOW }), {
    ok: false,
    reason: "expired",
  });
  assertEquals(decideSyncWrite({ row: null, tokenHash: null, userId: OWNER, now: NOW }), {
    ok: false,
    reason: "expired",
  });
});
