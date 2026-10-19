# Beta readiness — 19.10.2026

## Scope and source provenance

Code/documentation/local checks only. No deployment, database writes, migrations,
secrets changes, Stripe/AI activation, emails, invitations or real signatures.
No GitHub workflow was dispatched or queried in this step.

Requested baseline: `52eb377d` (Tests run `38473035619`, Build run `38473035604`,
failure details supplied by the owner). Initial sandbox HEAD was
`a50f33752930bfb448a92c99db08452b5c99d41f`, directly following that baseline;
its only additional change was platform-managed `previewAuthStorage.ts`.
That generated file was not edited by this work.
Verified code/test HEAD before this report: `efc3f8cdbfd6b04738edaf826150e164b1777457`.
The platform manages subsequent documentation commits; the closing response gives
the final observed SHA, not a manually created commit.

Read applicable root `AGENTS.md`, workspace/project instructions and CI workflows.
No workflow, gate, audit exclusion or test skip was weakened.

## Dependency repair

- Reproduced the precise frozen-install failure with **Bun 1.4.2 (744846f84)**:
  `overrides in package.json changed since bun.lock was saved`, exit 1.
- Regenerated `bun.lock` with that exact version, preserving **lockfileVersion 3**.
  The starting file actually declared v1; it was upgraded, never deliberately
  retained/downgraded to v1 as a workaround.
- All existing overrides survive, including nested MCP esbuild, docx/postcss nanoid,
  glob minimatch/brace-expansion and the resolved `$vite` reference.
- `@modelcontextprotocol/sdk`: **1.28.0 → 1.31.0**, exact transitive override;
  minimal fixed 1.x release for **GHSA-6qxp-vccf-f47h**. MCP wrapper remains 0.20.1.
- Existing MCP-only esbuild override now actually resolves **0.28.2**, rather
  than the stale 0.27.7 lock entry. No global esbuild override.
- Drizzle remains **drizzle-kit 0.31.11 / drizzle-orm 0.45.4**, unchanged from baseline.
- Lock diff against requested baseline: 45 inserted / 31 removed lines; package
  manifest adds only the SDK override. No broad dependency update.
- Sandbox initially used Bun 1.3.3; its automatic install repeatedly rewrote v3
  to v1 and dropped nested override metadata. The temporary sandbox executable
  was pointed to downloaded Bun 1.4.2 to stop this interference. This is not a
  committed environment or hosting change. CI already pins 1.4.2.
- `package-lock.json` is a pre-existing secondary npm v3 lock, not used by these
  Bun workflows. It was not regenerated; **it still contains SDK 1.28.0**.
  This work verifies Bun installs only, not npm reproducibility.

### Unresolved high: braces

**GHSA-vfj7-8cjw-p6xm remains OPEN.** npm registry latest is **3.0.3**;
the GitHub advisory lists `<=3.0.3` and `first_patched_version: null`.
Dependency paths include Tailwind 3 → micromatch/fast-glob and chokidar → braces.
There is no published compatible patched version to install.

No fictitious 3.0.4 pin, major framework migration, replacement shim, renamed
vulnerable package, ignore rule or softened security gate was introduced.
Exposure is in build/dev pattern parsing, but this is **not a security waiver**.
The unchanged high audit gate still fails. A vetted upstream fix or separately
tested compatible replacement/removal is required; the beta security gate is not green.

Sources checked read-only on 19.10:
- https://github.com/advisories/GHSA-6qxp-vccf-f47h
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://registry.npmjs.org/braces
- https://registry.npmjs.org/@modelcontextprotocol/sdk/1.31.0

## Local verification — not GitHub CI

| Check | Result and exact scope |
|---|---|
| Bun version | 1.4.2 (744846f84), Linux x64; Node 22.22.0 |
| `bun install --frozen-lockfile` | PASS, exit 0; 838 installs / 917 packages, no changes; byte comparison of lock before/after PASS |
| Clean temporary install, no node_modules | PASS, exit 0; **802 packages installed in 4.51 s** with frozen lock; lock remains byte-identical |
| `bun run test` | PASS, exit 0; **162 files, 2045 passed, 4 pre-existing skipped**, 86.54 s; run started 08:49:54 UTC |
| New dependency regressions | 3 passing tests: lock v3, all manifest/scoped overrides, every resolved SDK instance exactly 1.31.0 |
| Node security/static/webhook unit suites | **33 passed, 0 failed**, Node 22 experimental strip-types; synthetic fixtures only |
| Tests workflow Deno shared + webhook handler suite | **1035 passed, 0 failed**, Deno 2.6.10, 17 s, run from project root |
| Wizard full audit | PASS, exit 0, **0 findings / 0 CRITICAL** |
| Drizzle CLI smoke | PASS: versions 0.31.11 / 0.45.4; no database connection |
| MCP API compatibility smoke | PASS: SDK Client and wrapper Vite plugin imports/construction; no network connection opened |
| MCP extract-manifest CLI `--help` | Exit 0, no output; only startup smoke, not end-to-end manifest extraction |
| `git diff --check` | PASS |
| Automatic preview build signal | `build OK`, latest observed 08:49:43 UTC; no reported build errors |
| Standalone app typecheck | **NOT independently verified**: environment instructions prohibit manual project typechecks; automatic log does not expose a separate typecheck result |
| Full production build + prerender + SEO verification | **NOT independently verified**: manual project builds are prohibited in this environment; automatic `build OK` does not prove the complete production pipeline ran |
| GitHub Tests/Build rerun | **NOT verified**; no claim that local results are GitHub CI results |

The default sandbox package cache audit endpoint returned HTTP 404. Without
changing project configuration or secrets, unsetting only the registry selection
for the local audit command allowed the public npm audit endpoint:
`env -u NPM_CONFIG_REGISTRY bun audit --audit-level=high`.
Result: **exit 1, exactly 1 high finding: braces**. SDK advisory no longer appears.
Full JSON audit additionally lists moderate esbuild (legacy Drizzle loader chain),
postcss-selector-parser and sprintf-js advisories. These were not silently fixed
or excluded in this narrowly scoped change.

Verified file SHA-256:
- package.json: `1f33af5fd0090c585f8a4cd615aa2219d02a613a6120cfe23dbb11d07411bd3d`
- bun.lock: `86683274aa17c42b24f741bf32bbe0069bb3d7ff7abf95556cae24298ff4748d`

## Environment correction — supersedes historical “no staging” statements

**An isolated staging project exists**, as explicitly supplied by the owner in
this task. It has separate `static_catalog_*` tables, **all with 0 rows**.
This is owner-supplied environment evidence, not a fresh database query in this
step. No staging data, RLS, migration state, deployed functions, storage or
payment test was read/modified here; empty tables do not prove those gates pass.

**The main project's preview shares production and is NOT staging.**
Statements that no isolated staging exists in the Step 2, Step 5 and DTrust
reports are superseded by this correction. The next blocker is staging
validation/rehearsal, not creating a staging project.

## Files changed by this task

- `package.json`
- `bun.lock`
- `src/test/dependencyLock.test.ts`
- `AGENTS.md`
- `roadmap.md`
- `docs/operations/beta-readiness-2026-10-19.md`

## Remaining blockers and next checks

1. **braces high advisory**: no upstream fixed version; audit gate still fails.
2. **Independent typecheck and complete production build/SEO gate**: obtain
   explicit results from the platform or next GitHub run; automatic preview
   build success is not enough.
3. **GitHub CI**: observe new Tests/Build/security runs on the final SHA;
   this session did not verify their status.
4. **Staging rehearsal**: validate isolated schema, RLS/grants, migrations,
   storage, synthetic catalog delivery and payment reversal/source race paths
   in a separately authorized step. No migration status is asserted here.
5. Historical release blockers (not re-audited): production document payload
   gate/0047, trusted-source bridge activation proof, safe PDF source extraction,
   hosting CSP/anti-framing, provider data residency and legal consumer/SES text.
   Existing accepted catalog documents do not need blanket re-acceptance.
6. npm's secondary lock remains stale; do not use it as proof of this Bun fix.

**Conclusion:** frozen-install source repair and SDK advisory repair are locally
verified. This is not a complete green CI, security clearance or beta release.