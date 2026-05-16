// CI guard: scans migrations + edge functions for new SECURITY DEFINER funcs
// without internal authorization checks, and for likely exposed-data patterns
// (missing RLS, overly-permissive policies, leaked service-role / API keys).
//
// Exits non-zero so CI can block the merge. Allowlist known-safe items via
// `scripts/security-allowlist.json` (array of strings — substring match).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Finding = { file: string; line: number; rule: string; message: string };

const ROOT = process.cwd();
const ALLOWLIST_PATH = join(ROOT, "scripts/security-allowlist.json");
const allowlist: string[] = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : [];

// CLI: optional list of files to scan (used in CI to scan only changed files).
// Without args, scan everything (useful for the initial baseline).
const argFiles = process.argv.slice(2).filter((a) => !a.startsWith("--"));
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

// --- Report
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
process.exit(1);
