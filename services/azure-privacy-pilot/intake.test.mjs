import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { issueHandoff } from "./handoff.mjs";
import { authorizeIntakeOperation } from "./intake.mjs";

globalThis.crypto ??= webcrypto;
const secret = crypto.getRandomValues(new Uint8Array(32));
const subject = crypto.randomUUID();
const operationId = crypto.randomUUID();
const product = "contract_check";

async function proof() {
  return issueHandoff({ subject, operationId, product, audience: "dogovori-azure-intake", secret });
}

test("authorizes exact entitlement and reserves an opaque operation only once", async () => {
  const used = new Set();
  const reserved = new Set();
  const consumeOnce = async (nonce) => !used.has(nonce) && !!used.add(nonce);
  let checked;
  let binding;
  const checkEntitlement = async (claims) => { checked = claims; return true; };
  const reserveOperation = async (value) => {
    if (reserved.has(value.operationId)) return false;
    reserved.add(value.operationId);
    binding = value;
    return true;
  };
  const token = await proof();
  const input = { token, secret, consumeOnce, checkEntitlement, reserveOperation };
  const result = await authorizeIntakeOperation(input);
  assert.deepEqual(checked, { subject, operationId, product });
  assert.equal(binding.blobName, result.blobName);
  assert.match(result.blobName, /^[0-9a-f-]{36}$/);
  assert.equal(result.blobName.includes(subject), false);
  await assert.rejects(authorizeIntakeOperation(input), /Invalid handoff/);
  assert.equal(reserved.size, 1);
});

test("denied entitlement never reserves an operation and burns the proof", async () => {
  const used = new Set();
  const consumeOnce = async (nonce) => !used.has(nonce) && !!used.add(nonce);
  let reservations = 0;
  const token = await proof();
  const input = {
    token, secret, consumeOnce, checkEntitlement: async () => false,
    reserveOperation: async () => { reservations++; return true; },
  };
  await assert.rejects(authorizeIntakeOperation(input), /Intake denied/);
  assert.equal(reservations, 0);
  await assert.rejects(authorizeIntakeOperation({ ...input, checkEntitlement: async () => true }), /Invalid handoff/);
});

test("duplicate operation binding is denied even with a fresh signed proof", async () => {
  const used = new Set();
  const consumeOnce = async (nonce) => !used.has(nonce) && !!used.add(nonce);
  const reserved = new Set();
  const reserveOperation = async ({ operationId: id }) => !reserved.has(id) && !!reserved.add(id);
  const input = { secret, consumeOnce, checkEntitlement: async () => true, reserveOperation };
  await authorizeIntakeOperation({ ...input, token: await proof() });
  await assert.rejects(authorizeIntakeOperation({ ...input, token: await proof() }), /Intake denied/);
  assert.equal(reserved.size, 1);
});

test("fails closed without both independent backend checks", async () => {
  await assert.rejects(authorizeIntakeOperation({ token: await proof(), secret, consumeOnce: async () => true }), /not configured/);
});
