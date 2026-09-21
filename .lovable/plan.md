# Source-only P0 repair: quota, recovery and review authorization

## Scope and boundaries

Work only from HEAD `3ee88499aadf1b2b37f055694603bd79d6f0af5b`. No deployment, publishing, migration application, production reads/writes, real AI/payment/email calls, secret/config changes, public-copy edits, or strategy/article-evidence work.

## Implementation

1. **Quota ledger and migration parity**
   - Update both unapplied 0029 migration copies identically.
   - Bind operations to user, kind, purpose, session, document, batch and canonical SHA-256 digest.
   - Under operation and session locks, allow only a proven, fully resolved cancelled operation with the exact same binding to reserve and charge again; unresolved cancellation remains a typed reconciliation failure.
   - Tighten database digest constraints to 64 hexadecimal characters and keep canonical output lowercase.
   - Extend the TypeScript state contract and regression tests for cancelled retry, mismatch, unresolved state and serialized same-session behavior.

2. **Recoverable blank downloads**
   - Require a valid client operation UUID before legal grounding, quota reservation or generation.
   - Extend request artifacts with unique operation binding, purpose, digest and readiness metadata, with server-only mutation.
   - Recover an already uploaded matching artifact before generation, verify it still exists, commit/bind it, and issue a fresh signed URL.
   - Bind uploads durably before quota commit; synchronously remove failed bindings and record unresolved cleanup/commit outcomes for reconciliation.
   - Update every real caller to retain one UUID across retry, network loss and double-click; add injectable behavior tests covering all required crash/replay paths.

3. **Unified refinement ledger**
   - Remove the runtime correction-wave charging path from `refine-contract`; reserve/commit/cancel through `quota_operations` using a mandatory operation UUID, batch binding and canonical digest.
   - Redact contract, feedback and answers together with one collision-safe mapping before retrieval/model use.
   - Persist the exact inline result in `result_ref` before success; replay it exactly, and return reconciliation status for unknown commit outcomes.
   - Update the refinement caller to preserve the operation UUID until terminal success or an explicit payload change.
   - Add endpoint behavior tests and make the changed entrypoint pass explicit `deno check`.

4. **Durable anonymous entitlement**
   - Add server-only anonymous delivery operations and atomic reserve/commit/cancel RPCs to both migration copies.
   - Bind identity, mandatory request UUID and request digest; count only committed responses, cap atomically at five, replay committed responses exactly, and permit exact cancelled/expired retries.
   - Fail closed on identity/database/read/reserve/commit errors; remove the request-key rate-limit pseudo-reservation while retaining separate abuse limiting.
   - Keep the browser request UUID stable for the same message and replace it only for a new payload; add endpoint-level behavior tests including the concurrent sixth response contract.

5. **Review authorization and reachable grants**
   - Add a server-only grant issuer reachable from each legitimate generation/review flow, issued only after ownership/entitlement verification or for exact inline generated content.
   - Require either verified ownership of the referenced document/version or a valid one-time signed grant; remove manifest-only paid-model authorization.
   - Verify subject, owner, audience, operation, digest, expiry and nonce; consume nonce atomically and fail closed on storage errors.
   - Update legitimate callers and add denial/no-model, owner, inline, replay, cross-user/content and audit-user tests.

6. **Artifact sweep truthfulness**
   - For every removal omission, perform a bounded exact existence check.
   - Mark deleted only after confirmed removal/absence and successful database update; keep present/inconclusive rows pending with `delete_error`.
   - Add truthful confirmed/marked/unresolved counters and regression tests for partial results, existence and database errors, mixed buckets, filtering, starvation and reruns.

## Validation and final filesystem action

- Verify the two 0029 migration files are byte-identical.
- Run focused behavior suites, the full Deno suite, explicit `deno check` for every changed edge entrypoint, full Vitest with zero unhandled errors, TypeScript check and production build.
- Record SQL/pgTAP concurrency as **not executed** unless a local PostgreSQL test actually runs; keep that release gate open otherwise.
- After every test/build completes, restore all seven `public/sitemap*.xml` files byte-for-byte from `0de2067bda4f978142ffa6ab7490d8bed434fa1b`, run no generator/build afterward, and compare each SHA-256 against `git show`.
- Commit the source-only repair and report the actual commit SHA, exact changed files, exact commands/counts, seven sitemap hashes and residual blockers.
