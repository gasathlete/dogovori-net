/**
 * Auto-fix party-role mismatches in src/data/subWizards.generated.json.
 * Walks every REGISTRY entry, runs inferPartyRoles on (contractName || key),
 * and patches the "parties" object when it doesn't match.
 *
 * Run: bun run scripts/fix-generated-roles.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inferPartyRoles, partiesAreCompatible } from "../src/data/partyRoles";

const path = "src/data/subWizards.generated.json";
const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

let fixed = 0;
let added = 0;
let skipped = 0;
const examples: string[] = [];

for (const [key, entry] of Object.entries(data)) {
  const name = entry.contractName || key;
  const expected = inferPartyRoles(name);
  if (!expected) { skipped++; continue; }
  const cur = entry.parties;
  if (!cur || !cur.a || !cur.b) {
    entry.parties = { a: expected.a, b: expected.b };
    added++;
    if (examples.length < 6) examples.push(`+ ${name}  →  ${expected.a} / ${expected.b}`);
    continue;
  }
  if (partiesAreCompatible(name, cur)) continue;
  entry.parties = { a: expected.a, b: expected.b };
  fixed++;
  if (examples.length < 12) examples.push(`~ ${name}  was {${cur.a} / ${cur.b}}  →  ${expected.a} / ${expected.b}`);
}

writeFileSync(path, JSON.stringify(data), "utf8");
console.log(`Fixed mismatches: ${fixed}`);
console.log(`Added missing parties: ${added}`);
console.log(`Skipped (no inference): ${skipped}`);
for (const ex of examples) console.log("  " + ex);
