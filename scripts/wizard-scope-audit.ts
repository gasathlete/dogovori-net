/**
 * Scope audit — Sprint 2 deliverable.
 *
 * Walks the full catalog and produces a CSV report at
 *   /mnt/documents/wizard-scope-audit.csv
 *
 * Columns:
 *   sector_id, doc_name, slug, has_graph, graph_questions, graph_sections,
 *   has_clauses_in_db, clause_count, legacy_questions, status
 *
 * `status` is one of:
 *   migrated      — graph + ≥1 clause present
 *   partial       — graph present but no DB clauses yet
 *   legacy_only   — no graph; still uses the old sector questions array
 *
 * Usage:
 *   bunx tsx scripts/wizard-scope-audit.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CATALOG } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";
import { slugify } from "../src/lib/slugify";
import { QUESTION_GRAPHS } from "../src/data/questionGraphs/dogovor-za-naem-na-zhilishte";

const OUT = "/mnt/documents/wizard-scope-audit.csv";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

async function loadClauseCounts(): Promise<Record<string, number>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[audit] Supabase env vars missing — clause counts will be 0.");
    return {};
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await sb
    .from("template_clauses")
    .select("template_slug")
    .eq("active", true);
  if (error) {
    console.error("[audit] failed to read template_clauses:", error.message);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.template_slug] = (out[row.template_slug] ?? 0) + 1;
  }
  return out;
}

function legacyQuestionCount(sectorId: string, docName: string): number {
  const sector = SECTORS.find((s: { id: string }) => s.id === sectorId);
  if (!sector) return 0;
  const sub = sector.subWizards?.find((w: { docName: string }) => w.docName === docName);
  const qs = sub?.questions ?? sector.questions ?? [];
  return qs.length;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const clauseCounts = await loadClauseCounts();
  const rows: string[][] = [[
    "sector_id", "doc_name", "slug",
    "has_graph", "graph_questions", "graph_sections",
    "has_clauses_in_db", "clause_count",
    "legacy_questions", "status",
  ]];

  let migrated = 0, partial = 0, legacy = 0;

  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      const slug = slugify(doc.name);
      const graph = QUESTION_GRAPHS[slug];
      const clauseCount = clauseCounts[slug] ?? 0;
      const hasGraph = !!graph;
      const hasClauses = clauseCount > 0;
      let status: "migrated" | "partial" | "legacy_only";
      if (hasGraph && hasClauses) { status = "migrated"; migrated++; }
      else if (hasGraph) { status = "partial"; partial++; }
      else { status = "legacy_only"; legacy++; }

      rows.push([
        cat.sectorId, doc.name, slug,
        String(hasGraph),
        String(graph?.questions.length ?? 0),
        String(graph?.sections.length ?? 0),
        String(hasClauses), String(clauseCount),
        String(legacyQuestionCount(cat.sectorId, doc.name)),
        status,
      ].map(csvEscape));
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, rows.map((r) => r.join(",")).join("\n"), "utf8");

  console.log(`[audit] wrote ${rows.length - 1} rows → ${OUT}`);
  console.log(`[audit] migrated=${migrated}  partial=${partial}  legacy_only=${legacy}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
