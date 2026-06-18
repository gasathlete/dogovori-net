/**
 * Backfills `documentClass` on every entry in subWizards.generated.json.
 * Run: bun run scripts/backfill-document-class.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { classifyDocument } from "../src/data/partyRoles";

const path = "src/data/subWizards.generated.json";
const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

const counts: Record<string, number> = { unilateral: 0, receipt: 0, bilateral: 0 };
for (const [key, entry] of Object.entries(data)) {
  const cls = classifyDocument(entry.contractName || key);
  entry.documentClass = cls;
  counts[cls]++;
}

writeFileSync(path, JSON.stringify(data), "utf8");
console.log("Backfilled documentClass:", counts);
console.log("Total entries:", Object.keys(data).length);
