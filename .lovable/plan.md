# Stage 2B1B2 — resumable paid-product generation

## Scope
Implement the source-only generation runtime that advances one bounded, idempotent checkpoint per request and assembles only fully validated v2 paid results. Preserve payment proof, exact products/prices, public UI, protected migrations, generic quotas, and all Stage 2B1A/2B1B1 contracts. No live provider, deployment, SQL execution, email, Stripe, customer mutation, or IndexNow.

## Implementation
1. **Pure safety and adapter boundary**
   - Add deterministic reversible redaction with strict placeholder inventory validation and safe rehydration.
   - Require completed redaction and post-redaction reclassification before a model call; special-category input remains blocked.
   - Define a mockable external adapter using only the accepted product route/model policy, deterministic call IDs, explicit per-call token/output limits, and zero-retention readiness as a closed release gate.

2. **Pass A: complete bounded extraction**
   - Build canonical code-point chunks/batches covering every source character, including overlap accounting.
   - Runtime-validate each batch’s structured candidates before checkpointing.
   - Resolve excerpts to exact source spans, reject fabricated or ambiguous evidence, allow at most one bounded evidence repair per failed batch, and deterministically deduplicate findings/corrections.
   - Perform whole-source concept checks for `missing_protections`; retain only links to `found:false` whole-document absence checks.

3. **Pass B: product-specific assembly**
   - Synthesize from compact validated intermediates only after full Pass A coverage.
   - Assemble `contract_check`, `contract_improve`, and `negotiation_package` payloads with exact product requirements.
   - Validate correction anchors/overlaps and materially distinct strategies; resolve legal bases only through a mockable active knowledge-base resolver.
   - Run the complete Edge v2 validator and exact source/product binding check before a result can be marked ready.

4. **Resume and endpoint wiring**
   - Extend the existing job cursor machine without changing protected migrations unless the current RPC contract cannot represent required immutable checkpoints.
   - Make each invocation claim, execute, and atomically record at most one step; release leases deterministically on processing/no-work paths.
   - Enforce cumulative calls, input/output tokens, batches, and micro-USD before each external call; completed call IDs are never repeated.
   - Store only content-free telemetry and safe failure codes. Never touch payment proof or generic quota.

5. **Verification**
   - Add mocked unit/contract tests for safety gates, placeholder attacks, complete 80/limit/60k coverage, Unicode offsets, all resume points, leases/disconnects/idempotency/budget stops, evidence/absence/legal-basis rejection, all three valid outputs, zero findings, corrections and premium artifacts.
   - Run focused tests, all normally typechecked Deno tests, full frontend tests, TypeScript check, touched lint, and the network-silent production build separately.
   - Commit the completed source atomically and report exact HEAD, changed files, state machine, budgets/mock totals, telemetry, and deferred selection/refinement/UI work.

## Technical assumptions
- The existing `2b1b1.3` policy remains authoritative unless a failing contract proves it cannot enforce the adapter’s calls.
- Model behavior is represented only by injected mocks in this stage; no provider SDK request is executed.
- Zero-retention readiness remains false/closed until separately verified during rollout.
- Protected migrations 0019–0021 remain byte-identical; any unavoidable schema extension would use reserved migration 0022 only after proving it is necessary.
