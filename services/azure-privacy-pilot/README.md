# Azure document intake pilot — source only

This is a content-free handoff prototype. It issues a five-minute HMAC proof
for one opaque user UUID, operation UUID and fixed product ID. It requires an
atomic, durable one-time nonce store on the independent backend. The separate
`intake.mjs` orchestrator rechecks the exact entitlement on that backend and
reserves a random Blob path for the operation. Both checks are injected and
must be implemented against authoritative, durable stores. A failure burns
the proof; the client must start a fresh operation. This code does not create
an Azure resource, accept a file, issue a SAS, call OCR or a model, provide a
working entitlement store, or enable any product flag. Run:
`node --test services/azure-privacy-pilot/*.test.mjs`.

## Intended route

1. An authenticated site server checks the exact operation and entitlement,
   then signs a proof. Its signing key remains server side.
2. The Azure backend verifies the proof, atomically consumes its nonce,
   independently checks entitlement and atomically binds the operation to a
   random Blob path. The supplied test callbacks are in-memory examples only.
3. A separately reviewed Azure component grants a short-lived,
   create-only **user delegation SAS** for that one blob. It records the
   operation binding; the browser uploads directly to Azure Blob Storage.
4. Azure processes and exports the document. The browser retrieves the result
   directly; Lovable receives only opaque status codes and references.

The proposed SAS cannot enforce file size by itself. The backend must validate
actual blob size, type and content after upload, quarantine it before processing,
limit concurrent sessions, enforce quotas, delete rejected blobs and expire
abandoned uploads. Blob names and telemetry must never include original
filenames or content hashes. CORS must list only approved origins and methods.

## Account connection and acceptance

- Use an organization owned Azure subscription and separate pilot resource
  group. Give a deployment identity only the roles needed on that resource
  group, through GitHub OIDC; do not put subscription credentials or keys in
  chat or in the repository. Keep runtime managed identity separate from the
  deployment identity.
- Verify the exact Microsoft agreement, region, service availability, OCR
  behavior, model deployment type, abuse monitoring, retention and deletion
  before selecting a provider route. An Azure account alone proves none of these.
- Start with synthetic files only. Verify browser network trace excludes the
  existing Lovable Cloud, Edge, Storage and AI Gateway for file content,
  extracted text and results. Test replay, wrong user, expiry, deletion,
  backup/log behavior and rollback before any real document.
- The current legacy upload and direct API paths remain unresolved release
  blockers. This pilot does not change existing database policies or flags.

References: [Microsoft user delegation SAS](https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview), [Document Intelligence privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security), [Azure model privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy).
