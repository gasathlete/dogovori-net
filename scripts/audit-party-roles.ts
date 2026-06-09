/**
 * Audit: detect party-role mismatches across all contract templates.
 *
 * Run: bun run scripts/audit-party-roles.ts
 *
 * Produces reports/party-roles-audit.csv with one row per template
 * whose configured (or inherited) parties differ from what the
 * centralised inferPartyRoles() rules expect.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SECTORS } from "../src/data/sectors";
import { REGISTRY } from "../src/data/subWizardsGenerated";
import { inferPartyRoles, type PartyRoles } from "../src/data/partyRoles";

type Row = {
  documentName: string;
  sectorId: string;
  source: "explicit" | "generated" | "inherited";
  currentA: string;
  currentB: string;
  expectedA: string;
  expectedB: string;
  issue: "MISMATCH" | "REVERSED";
};

const rows: Row[] = [];

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я]+/gi, "");
const startsLike = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.startsWith(y.slice(0, Math.min(6, y.length))) || y.startsWith(x.slice(0, Math.min(6, x.length)));
};

function classify(current: PartyRoles, expected: PartyRoles): "MATCH" | "MISMATCH" | "REVERSED" {
  const direct = startsLike(current.a, expected.a) && startsLike(current.b, expected.b);
  if (direct) return "MATCH";
  const reversed = startsLike(current.a, expected.b) && startsLike(current.b, expected.a);
  if (reversed) return "REVERSED";
  return "MISMATCH";
}

// 1) explicit sub-wizards in SECTORS
for (const sector of SECTORS) {
  for (const sw of sector.subWizards ?? []) {
    const docName = sw.contractName || sw.documentName;
    const expected = inferPartyRoles(docName);
    if (!expected) continue;
    const current = sw.parties ?? sector.parties;
    const source: Row["source"] = sw.parties ? "explicit" : "inherited";
    const verdict = classify(current, expected);
    if (verdict === "MATCH") continue;
    rows.push({
      documentName: docName,
      sectorId: sector.id,
      source,
      currentA: current.a,
      currentB: current.b,
      expectedA: expected.a,
      expectedB: expected.b,
      issue: verdict,
    });
  }
}

// 2) generated registry
for (const [docName, entry] of Object.entries(REGISTRY) as Array<[string, any]>) {
  const expected = inferPartyRoles(entry.contractName || docName);
  if (!expected) continue;
  const current: PartyRoles = entry.parties ?? { a: "", b: "" };
  if (!current.a || !current.b) {
    rows.push({
      documentName: docName,
      sectorId: "(generated)",
      source: "generated",
      currentA: current.a || "(missing)",
      currentB: current.b || "(missing)",
      expectedA: expected.a,
      expectedB: expected.b,
      issue: "MISMATCH",
    });
    continue;
  }
  const verdict = classify(current, expected);
  if (verdict === "MATCH") continue;
  rows.push({
    documentName: docName,
    sectorId: "(generated)",
    source: "generated",
    currentA: current.a,
    currentB: current.b,
    expectedA: expected.a,
    expectedB: expected.b,
    issue: verdict,
  });
}

const header = ["documentName", "sectorId", "source", "currentA", "currentB", "expectedA", "expectedB", "issue"];
const csv = [header.join(",")].concat(
  rows.map((r) => header.map((h) => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(",")),
).join("\n");

const outPath = "reports/party-roles-audit.csv";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, csv, "utf8");

const mismatch = rows.filter((r) => r.issue === "MISMATCH").length;
const reversed = rows.filter((r) => r.issue === "REVERSED").length;
console.log(`Wrote ${outPath}`);
console.log(`Total issues: ${rows.length} (MISMATCH: ${mismatch}, REVERSED: ${reversed})`);
if (rows.length) {
  console.log("\nFirst 25:");
  for (const r of rows.slice(0, 25)) {
    console.log(`  [${r.issue}] ${r.source.padEnd(10)} ${r.sectorId.padEnd(18)} ${r.documentName}`);
    console.log(`             current: ${r.currentA} / ${r.currentB}`);
    console.log(`             expected: ${r.expectedA} / ${r.expectedB}`);
  }
}
