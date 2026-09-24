import { verifyAndConsumeHandoff } from "./handoff.mjs";

/**
 * Authorize one document operation on the independent backend.
 * All callbacks must run server side. This function never receives a file,
 * grants Blob access or trusts an entitlement asserted by the browser.
 */
export async function authorizeIntakeOperation({
  token, secret, consumeOnce, checkEntitlement, reserveOperation, now = Date.now(),
}) {
  if (typeof checkEntitlement !== "function" || typeof reserveOperation !== "function") {
    throw new Error("Intake is not configured");
  }

  // The nonce must be claimed atomically in shared durable storage, not in a
  // process-local Set. A failed downstream step burns the proof and fails closed.
  const { subject, operationId, product } = await verifyAndConsumeHandoff({
    token, secret, consumeOnce, now,
  });

  // Query the authoritative entitlement store for this exact operation. Never
  // accept purchase or plan details supplied in a handoff or browser request.
  if (await checkEntitlement({ subject, operationId, product }) !== true) {
    throw new Error("Intake denied");
  }

  // No filename, user ID, document hash or product appears in the Blob path.
  // reserveOperation must atomically reject an existing operation ID and save
  // this binding before a separate, reviewed component could grant Blob access.
  const blobName = `${crypto.randomUUID()}`;
  if (await reserveOperation({ subject, operationId, product, blobName }) !== true) {
    throw new Error("Intake denied");
  }
  return { operationId, product, blobName };
}
