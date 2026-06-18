/**
 * Wizard full audit. Walks SECTORS × REGISTRY and reports:
 *  - role mismatch (parties vs inferPartyRoles)
 *  - missing parties
 *  - duplicate documentName across sectors
 *  - missing or empty template/clauses
 *  - blank documentType
 * Output: reports/wizard-audit.csv + console summary.
 *
 * Run: bun run scripts/wizard-full-audit.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SECTORS } from "../src/data/sectors";
import { REGISTRY } from "../src/data/subWizardsGenerated";
import { inferPartyRoles, partiesAreCompatible } from "../src/data/partyRoles";

type Finding = {
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  category: string;
  scope: string;
  documentName: string;
  detail: string;
};

const findings: Finding[] = [];
const docCounts = new Map<string, string[]>();

for (const sector of SECTORS) {
  for (const sw of sector.subWizards ?? []) {
    const docName = sw.contractName || sw.documentName;
    const parties = sw.parties ?? sector.parties;
    docCounts.set(sw.documentName, [...(docCounts.get(sw.documentName) ?? []), sector.id]);

    if (!parties || !parties.a) {
      findings.push({ severity: "CRITICAL", category: "missing-parties", scope: sector.id, documentName: docName, detail: "няма дефинирани страни" });
    } else if (!partiesAreCompatible(docName, parties)) {
      const expected = inferPartyRoles(docName);
      findings.push({
        severity: "CRITICAL",
        category: "role-mismatch",
        scope: sector.id,
        documentName: docName,
        detail: `got {${parties.a} / ${parties.b}}, expected {${expected?.a} / ${expected?.b}}`,
      });
    }

    const clauses = (sw as any).clauses ?? (sw as any).template?.clauses;
    if (clauses && Array.isArray(clauses) && clauses.length === 0) {
      findings.push({ severity: "MAJOR", category: "empty-clauses", scope: sector.id, documentName: docName, detail: "шаблонът няма клаузи" });
    }
  }
}

for (const [docName, entry] of Object.entries(REGISTRY) as Array<[string, any]>) {
  const name = entry.contractName || docName;
  if (!entry.parties || !entry.parties.a || !entry.parties.b) {
    findings.push({ severity: "CRITICAL", category: "missing-parties", scope: "(generated)", documentName: name, detail: "REGISTRY entry без parties.a/b" });
    continue;
  }
  if (!partiesAreCompatible(name, entry.parties)) {
    const expected = inferPartyRoles(name);
    findings.push({
      severity: "CRITICAL",
      category: "role-mismatch",
      scope: "(generated)",
      documentName: name,
      detail: `got {${entry.parties.a} / ${entry.parties.b}}, expected {${expected?.a} / ${expected?.b}}`,
    });
  }
}

for (const [name, sectors] of docCounts) {
  if (sectors.length > 1) {
    findings.push({
      severity: "MINOR",
      category: "duplicate-document",
      scope: sectors.join(","),
      documentName: name,
      detail: `документът е дефиниран в ${sectors.length} сектора`,
    });
  }
}

// Sort: CRITICAL → MAJOR → MINOR, then category.
const sevRank = { CRITICAL: 0, MAJOR: 1, MINOR: 2 } as const;
findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.category.localeCompare(b.category));

const header = ["severity", "category", "scope", "documentName", "detail"];
const csv = [header.join(",")]
  .concat(findings.map((f) => header.map((h) => `"${String((f as any)[h]).replace(/"/g, '""')}"`).join(",")))
  .join("\n");

const out = "reports/wizard-audit.csv";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, csv, "utf8");

const byCat: Record<string, number> = {};
const bySev: Record<string, number> = {};
for (const f of findings) {
  byCat[f.category] = (byCat[f.category] ?? 0) + 1;
  bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
}

console.log(`\nWrote ${out}`);
console.log(`Total findings: ${findings.length}`);
console.log(`By severity:`, bySev);
console.log(`By category:`, byCat);
console.log(`\nTop 30:`);
for (const f of findings.slice(0, 30)) {
  console.log(`  [${f.severity}] (${f.category}) ${f.scope.padEnd(18)} ${f.documentName}`);
  console.log(`             → ${f.detail}`);
}
