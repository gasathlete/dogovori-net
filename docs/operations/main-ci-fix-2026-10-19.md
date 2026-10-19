# Main CI fix — 19 October 2026

Starting HEAD: `780aa9acfe3d6bb7c0cd6264c4dd408219b2b485`. Source-fix commit before this report: `a943da799f72b8f685f2cf8c8749510ef6ef4be7`.

## Concrete failures and fixes

- Full units reproduced one failure: `aiJsonParsers.test.ts` mistook `JSON.parse(text)` of the static catalog's bounded HTTP request for AI output. Renamed the variable to `requestBodyText` and documented the strict non-AI boundary. No parser exception, skipped test or relaxed assertion was added; malformed requests remain rejected. Eight new behavioral tests assert valid input, malformed/partial/fenced/trailing-comma rejection, unknown-key/non-object rejection and byte limit.
- Remaining workflow Deno tests exposed three typing failures in `static-catalog-admin.test.ts`: ArrayBufferLike passed to digest and a narrowly inferred fixture row. Copy bytes with `Uint8Array.from` and explicitly type the row as its existing ledger Row type. All assertions preserved.
- Extra static-boundary workflow check with `--no-config --node-modules-dir=auto` exposed TS2339 on `init.headers` in shared Stripe transport. Narrow by property existence before accessing headers; gateway routing and credential forwarding unchanged. Both exact workflow typechecks then passed.

## Executed local evidence

| Command/check | Result |
|---|---|
| Initial `bun run test` (installed Bun 1.3.3) | 2102 passed, 1 failed, 4 existing skipped; 165 passed files, 1 failed |
| Affected Vitest files via Bun 1.4.2 | 34 passed, 0 failed |
| Final full `bun run test` via Bun 1.4.2 | 2111 passed, 0 failed, 4 existing skipped; 167 passed files |
| Affected Deno static-admin tests, typechecking enabled | 11 passed, 0 failed |
| Exact Tests workflow Deno shared + webhook handlers | 1046 passed, 0 failed, typechecking enabled |
| Exact Tests workflow Deno check: generate-job, draft-sync, draft-claim, payments-webhook, create-product-checkout | Passed, also rerun after Stripe narrowing |
| Exact static-boundary workflow Deno check: static-catalog + webhook-proof, no-config/auto node modules | Passed after narrowing |
| Exact Node strip-types proof/static combined command | 26 passed, 0 failed (local Node 22.22.0; CI uses Node 24) |
| Wizard full audit via Bun 1.4.2 | 0 findings, no CRITICAL |
| Isolated Bun 1.4.2 frozen install, ignore-scripts | Passed, 802 packages; project lock unchanged at v3 |
| Automatic preview build log | build OK at 14:07:15 UTC; not a manual production build claim |

The redundant named Vitest subsets in Tests workflow were covered by the final full suite rather than run separately again. No blanket timeout changes, new skips, production build rerun or remote GitHub run claim. Full units completed before the final type-only Stripe narrowing; both affected entrypoint typechecks were rerun afterward.

Changed files: `supabase/functions/_shared/static-catalog.ts`, `supabase/functions/_shared/static-catalog-admin.test.ts`, `supabase/functions/_shared/stripe.ts`, `src/test/staticCatalogRequest.test.ts`, `roadmap.md`, this report. Production/catalog regeneration, Node fixtures, package manifest, lock, database, checkout flags and published deployment unchanged. No publish or backend deploy.

## Precise remaining security gate

GitHub advisory API: `GHSA-vfj7-8cjw-p6xm`, high, braces recursive AST stack-exhaustion DoS via deeply nested patterns; affected `<=3.0.3`, first patched version null. npm registry latest confirmed `3.0.3` on this date. No supported patched release is available to pin.

`npm ls braces --all` confirms only `tailwindcss@3.4.19` (dev dependency) → `chokidar@3.6.0` → `braces@3.0.3`, and Tailwind → `micromatch@4.0.8` → the same braces. Lock additionally contains Tailwind → fast-glob → micromatch. No braces import in app or edge source. The affected code is the build/development glob toolchain, not the deployed browser or commerce edge runtime. Residual risk: attacker-controlled deeply nested glob patterns reaching this toolchain can terminate its Node process. Security shield remains failing on this advisory; no suppression, fake override or unrelated migration was introduced.

Remote GitHub Tests must rerun on the tool-generated final SHA; local results do not establish its status. Session cost is not available from local test commands; confirmed task total supplied by owner was 34.2/100 before this batch.