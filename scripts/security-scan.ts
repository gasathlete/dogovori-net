// CI guard: scans migrations + edge functions for new SECURITY DEFINER funcs
// without internal authorization checks, and for likely exposed-data patterns
// (missing RLS, overly-permissive policies, leaked service-role / API keys).
//
// Exits non-zero so CI can block the merge. Allowlist known-safe items via
// `scripts/security-allowlist.json` (array of strings — substring match).
//
// Flags:
//   --sarif=<path>   also write a SARIF v2.1.0 report to <path> for GitHub
//                    Code Scanning ingestion (and history over time).
//   --github         emit GitHub Actions workflow commands (::error file=…)
//                    so findings appear inline in PR diffs / Checks UI.
//   --no-exit-code   report findings but exit 0 (used by scheduled full scans
//                    that should upload SARIF without failing the workflow).
//
// Positional args: list of files to scan. If none are given, the whole repo
// is scanned (used for the scheduled weekly run + initial baseline).

import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

type Finding = { file: string; line: number; rule: string; message: string };

const ROOT = process.cwd();
const ALLOWLIST_PATH = join(ROOT, "scripts/security-allowlist.json");
const allowlist: string[] = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : [];

const args = process.argv.slice(2);
const flagSarif = args.find((a) => a.startsWith("--sarif="))?.split("=", 2)[1];
const flagGithub = args.includes("--github");
const flagNoExit = args.includes("--no-exit-code");
const argFiles = args.filter((a) => !a.startsWith("--"));
const SCAN_ALL = argFiles.length === 0;

const findings: Finding[] = [];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function add(f: Finding) {
  const key = `${relative(ROOT, f.file)}:${f.rule}`;
  if (allowlist.some((a) => key.includes(a) || f.message.includes(a))) return;
  findings.push(f);
}

// --- 1. Scan SQL migrations for SECURITY DEFINER + exposed-data patterns
const allMigrations = walk(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
const migrations = SCAN_ALL
  ? allMigrations
  : allMigrations.filter((f) => argFiles.some((a) => f.endsWith(a) || a.endsWith(relative(ROOT, f))));
for (const file of migrations) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  // Find function definitions with SECURITY DEFINER, check for authz guard inside body.
  const funcRegex = /create\s+(or\s+replace\s+)?function\s+([a-z0-9_."]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?security\s+definer[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
  let m: RegExpExecArray | null;
  while ((m = funcRegex.exec(text)) !== null) {
    const name = m[2];
    const body = m[4];
    const hasAuthz =
      /has_role\s*\(/i.test(body) ||
      /is_staff\s*\(/i.test(body) ||
      /is_team_(admin|member)\s*\(/i.test(body) ||
      /auth\.uid\s*\(\s*\)/i.test(body) ||
      /auth\.role\s*\(\s*\)/i.test(body);
    if (!hasAuthz) {
      const line = text.slice(0, m.index).split("\n").length;
      add({
        file,
        line,
        rule: "security-definer-no-authz",
        message: `SECURITY DEFINER function ${name} has no auth.uid()/has_role/is_staff guard. Add an explicit check or allowlist it.`,
      });
    }
  }

  // Tables created without enable row level security in the same migration.
  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.[a-z0-9_]+)/gi;
  while ((m = tableRegex.exec(text)) !== null) {
    const tbl = m[1];
    const rlsOn = new RegExp(`alter\\s+table\\s+${tbl.replace(".", "\\.")}\\s+enable\\s+row\\s+level\\s+security`, "i").test(text);
    if (!rlsOn) {
      const line = text.slice(0, m.index).split("\n").length;
      add({
        file,
        line,
        rule: "table-without-rls",
        message: `Table ${tbl} created without "enable row level security" in same migration.`,
      });
    }
  }

  // Overly-permissive policies.
  lines.forEach((ln, i) => {
    if (/create\s+policy[\s\S]/i.test(ln)) {
      const window = lines.slice(i, i + 8).join(" ");
      if (/\busing\s*\(\s*true\s*\)/i.test(window) && /\bfor\s+(all|update|delete|insert)\b/i.test(window)) {
        add({
          file,
          line: i + 1,
          rule: "permissive-policy",
          message: `Policy uses USING (true) for write/all — verify this is intentional.`,
        });
      }
    }
  });
}

// --- 2. Scan codebase + functions for hardcoded secrets / service-role leaks
const allCode = [
  ...walk(join(ROOT, "src")),
  ...walk(join(ROOT, "supabase/functions")),
  ...walk(join(ROOT, "scripts")),
].filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
const codeFiles = SCAN_ALL
  ? allCode
  : allCode.filter((f) => argFiles.some((a) => f.endsWith(a) || a.endsWith(relative(ROOT, f))));

for (const file of codeFiles) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((ln, i) => {
    // service-role key referenced outside edge functions
    if (/SUPABASE_SERVICE_ROLE_KEY/.test(ln) && !file.includes("supabase/functions/")) {
      add({
        file,
        line: i + 1,
        rule: "service-role-leak",
        message: `SUPABASE_SERVICE_ROLE_KEY referenced outside supabase/functions/ — must never reach the client.`,
      });
    }
    // hardcoded JWT (eyJ... long)
    const jwtMatch = ln.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
    if (jwtMatch && !/supabase\/client\.ts$/.test(file) && !/PUBLISHABLE|ANON/i.test(ln)) {
      add({
        file,
        line: i + 1,
        rule: "hardcoded-jwt",
        message: `Hardcoded JWT detected (${jwtMatch[0].slice(0, 24)}…). Move to a secret.`,
      });
    }
    // generic API key patterns
    if (/(sk_live_|sk_test_|whsec_|rk_live_)[A-Za-z0-9]{16,}/.test(ln)) {
      add({
        file,
        line: i + 1,
        rule: "hardcoded-api-key",
        message: `Hardcoded Stripe/secret-style key detected. Move to Supabase secret.`,
      });
    }
  });
}

// --- Rule metadata for SARIF
const RULES: Record<string, { name: string; shortDescription: string; help: string; level: "error" | "warning" }> = {
  "security-definer-no-authz": {
    name: "SECURITY DEFINER without authorization guard",
    shortDescription: "SECURITY DEFINER function missing has_role/is_staff/auth.uid() check",
    help: "Add an explicit auth.uid()/has_role/is_staff/is_team_admin check inside the function body, or allowlist if intentional.",
    level: "error",
  },
  "table-without-rls": {
    name: "Table created without RLS",
    shortDescription: "public.* table created without enable row level security",
    help: "Add `alter table <tbl> enable row level security;` in the same migration.",
    level: "error",
  },
  "permissive-policy": {
    name: "Permissive RLS policy",
    shortDescription: "Policy uses USING (true) for write/all operations",
    help: "Restrict USING / WITH CHECK to the relevant owner/role predicate.",
    level: "warning",
  },
  "service-role-leak": {
    name: "Service-role key leaked to client",
    shortDescription: "SUPABASE_SERVICE_ROLE_KEY referenced outside supabase/functions/",
    help: "Service-role keys must only live in edge functions. Move the call server-side.",
    level: "error",
  },
  "hardcoded-jwt": {
    name: "Hardcoded JWT",
    shortDescription: "Long JWT literal embedded in source",
    help: "Move the token to a Supabase secret / env var and read it at runtime.",
    level: "error",
  },
  "hardcoded-api-key": {
    name: "Hardcoded API key",
    shortDescription: "Stripe-style secret key embedded in source",
    help: "Move the key to a Supabase secret / env var. Rotate the leaked key.",
    level: "error",
  },
};

// --- SARIF output for GitHub Code Scanning
if (flagSarif) {
  const ruleIds = Array.from(new Set(findings.map((f) => f.rule)));
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "lovable-security-scan",
            informationUri: "https://docs.lovable.dev/features/security",
            version: "1.0.0",
            rules: ruleIds.map((id) => {
              const r = RULES[id] ?? { name: id, shortDescription: id, help: "", level: "warning" as const };
              return {
                id,
                name: r.name,
                shortDescription: { text: r.shortDescription },
                fullDescription: { text: r.shortDescription },
                helpUri: "https://docs.lovable.dev/features/security",
                help: { text: r.help, markdown: r.help },
                defaultConfiguration: { level: r.level },
              };
            }),
          },
        },
        results: findings.map((f) => ({
          ruleId: f.rule,
          level: RULES[f.rule]?.level ?? "warning",
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: relative(ROOT, f.file), uriBaseId: "%SRCROOT%" },
                region: { startLine: Math.max(1, f.line) },
              },
            },
          ],
        })),
      },
    ],
  };
  mkdirSync(dirname(flagSarif), { recursive: true });
  writeFileSync(flagSarif, JSON.stringify(sarif, null, 2));
  console.log(`✓ wrote SARIF report to ${flagSarif} (${findings.length} result(s))`);
}

// --- GitHub Actions inline annotations
if (flagGithub) {
  for (const f of findings) {
    const sev = RULES[f.rule]?.level === "error" ? "error" : "warning";
    const file = relative(ROOT, f.file);
    // Escape per https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions
    const msg = f.message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(`::${sev} file=${file},line=${f.line},title=${f.rule}::${msg}`);
  }
}

// --- Human-readable report
if (findings.length === 0) {
  console.log("✓ security-scan: no new findings");
  process.exit(0);
}

console.error(`\n✗ security-scan: ${findings.length} finding(s)\n`);
for (const f of findings) {
  console.error(`  [${f.rule}] ${relative(ROOT, f.file)}:${f.line}`);
  console.error(`    ${f.message}`);
}
console.error(
  `\nIf a finding is a false positive, add a substring (e.g. "rule-name" or the file path) to scripts/security-allowlist.json.\n`,
);
process.exit(flagNoExit ? 0 : 1);
