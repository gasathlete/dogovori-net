import { test } from "node:test";
import { strict as assert } from "node:assert";
import { issueHandoff, verifyAndConsumeHandoff } from "./handoff.mjs";

const subject = "2b1f71d0-2b1f-41d0-8a11-2b1f71d02b1f";
const operationId = "5c1f71d0-5c1f-41d0-8a11-5c1f71d05c1f";
const secret = crypto.getRandomValues(new Uint8Array(32));
const now = Date.parse("2026-09-24T08:00:00Z");
const input = { subject, operationId, product: "contract_check", audience: "dogovori-azure-intake", secret, now };

test("accepts one operation and rejects replay", async () => {
  const token = await issueHandoff(input);
  const seen = new Set();
  const consumeOnce = async (jti) => seen.has(jti) ? false : (seen.add(jti), true);
  assert.deepEqual(await verifyAndConsumeHandoff({ token, secret, consumeOnce, now }), {
    subject, operationId, product: "contract_check",
  });
  await assert.rejects(verifyAndConsumeHandoff({ token, secret, consumeOnce, now }));
});

test("rejects expiry, tampering, wrong key and missing replay store", async () => {
  const token = await issueHandoff(input);
  const consumeOnce = async () => true;
  await assert.rejects(verifyAndConsumeHandoff({ token, secret, consumeOnce, now: now + 301000 }));
  await assert.rejects(verifyAndConsumeHandoff({ token: `${token}x`, secret, consumeOnce, now }));
  await assert.rejects(verifyAndConsumeHandoff({ token, secret: crypto.getRandomValues(new Uint8Array(32)), consumeOnce, now }));
  await assert.rejects(verifyAndConsumeHandoff({ token, secret, now }));
});

test("rejects free text, unknown products and weak keys before issuing", async () => {
  await assert.rejects(issueHandoff({ ...input, subject: "ЕГН 9001010000" }));
  await assert.rejects(issueHandoff({ ...input, product: "free-form" }));
  await assert.rejects(issueHandoff({ ...input, secret: new Uint8Array(8) }));
});
