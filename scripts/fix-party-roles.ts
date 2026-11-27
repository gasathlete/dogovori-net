/**
 * Auto-fix party-role mismatches in src/data/subWizardsGenerated.ts.
 * For each REGISTRY entry whose parties don't match inferPartyRoles
 * (MISMATCH or REVERSED), rewrite the `parties` block in place.
 *
 * Run: bun run scripts/fix-party-roles.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { REGISTRY } from "../src/data/subWizardsGenerated";
import { inferPartyRoles } from "../src/data/partyRoles";

const filePath = "src/data/subWizardsGenerated.ts";
let src = readFileSync(filePath, "utf8");

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я]+/gi, "");
const startsLike = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x.startsWith(y.slice(0, Math.min(6, y.length))) || y.startsWith(x.slice(0, Math.min(6, x.length)));
};

let fixed = 0;
let unchanged = 0;

for (const [docName, entry] of Object.entries(REGISTRY) as Array<[string, any]>) {
  const expected = inferPartyRoles(entry.contractName || docName);
  if (!expected) continue;
  const cur = entry.parties ?? { a: "", b: "" };
  const direct = startsLike(cur.a, expected.a) && startsLike(cur.b, expected.b);
  const reversed = startsLike(cur.a, expected.b) && startsLike(cur.b, expected.a);
  if (direct) { unchanged++; continue; }

  const newA = expected.a;
  const newB = expected.b;

  // Find the JSON block: "<docName>": { ... "parties": { "a": "...", "b": "..." } }
  // We locate the entry by exact key, then replace its parties block.
  const keyEscaped = docName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `("${keyEscaped}":\\s*\\{[\\s\\S]*?"parties":\\s*\\{\\s*"a":\\s*)"[^"]*"(\\s*,\\s*"b":\\s*)"[^"]*"`,
    "m",
  );
  if (blockRe.test(src)) {
    src = src.replace(blockRe, (_m, p1, p2) => `${p1}"${newA}"${p2}"${newB}"`);
    fixed++;
    continue;
  }

  // Entry has no "parties" key at all → insert one before closing brace.
  const insertRe = new RegExp(
    `("${keyEscaped}":\\s*\\{[\\s\\S]*?)(\\n\\s*\\}\\s*,?\\s*\\n)`,
    "m",
  );
  if (insertRe.test(src)) {
    src = src.replace(insertRe, (_m, head, tail) => {
      // Ensure trailing comma after head's last property
      const ensured = head.replace(/[\s,]*$/, "");
      return `${ensured},\n    "parties": {\n      "a": "${newA}",\n      "b": "${newB}"\n    }${tail}`;
    });
    fixed++;
    continue;
  }

  console.warn(`Could not locate entry for: ${docName}`);
}

writeFileSync(filePath, src, "utf8");
console.log(`Fixed: ${fixed}, unchanged (already correct): ${unchanged}`);
