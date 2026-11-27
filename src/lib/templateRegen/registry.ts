/**
 * Проследим регистър за всички канонични каталожни документи.
 * Чиста функция: входът се подготвя от scripts/template-regen.ts.
 */
import { CATALOG_RULES, bracketImbalance, extractCitations, scanTemplateText } from "./catalogChecks";
import type { Finding, RegenScope, RegistryStatus, TemplateCandidate } from "./types";

export interface RegistryInput {
  catalogName: string;
  categoryId: string;
  catalogSlug: string;
  draftSlug: string | null;
  /** Как resolver-ът е избрал файла; fuzzy = резервно съвпадение с файл на друг документ. */
  resolution: "exact" | "fuzzy" | null;
  sourceSha256: string | null;
  text: string | null;
}

export interface RegistryEntry {
  catalogName: string;
  categoryId: string;
  catalogSlug: string;
  draftSlug: string | null;
  resolution: "exact" | "fuzzy" | null;
  sourceSha256: string | null;
  sourceVersion: "v1-original";
  candidateVersion: string | null;
  scope: RegenScope;
  status: RegistryStatus;
  findings: Finding[];
  unverifiedCitations: string[];
  unresolvedFacts: string[];
  checks: { rules: number; bracketImbalance: number; placeholders: number };
  /** Историческото приемане от юрист важи само за оригинала. */
  historicalAcceptance: "owner_reported_catalog_level_2026-09-28" | null;
  candidateLegalApproval: null;
  kits: string[];
}

export interface KitDependency {
  kitId: string;
  items: string[];
  status: "unchanged" | "needs_recheck";
  changedItems: string[];
  contradictions: string[];
}

export interface Registry {
  generatedFor: string;
  totals: {
    catalogEntries: number;
    withFullText: number;
    withoutFullText: number;
    distinctDraftFiles: number;
    reachableDraftFiles: number;
    draftFilesSharedByEntries: number;
    rewrittenDraftFiles: number;
    rewrittenCandidates: number;
    fuzzyResolvedEntries: number;
    scopeMismatchEntries: number;
    scannedOnly: number;
    entriesWithOpenFindings: number;
    legalErrorFindings: number;
    legallyApprovedCandidates: 0;
  };
  entries: RegistryEntry[];
  kits: KitDependency[];
  duplicateDraftSlugs: string[][];
  orphanDraftSlugs: string[];
}

export function buildRegistry(args: {
  date: string;
  inputs: readonly RegistryInput[];
  candidates: readonly TemplateCandidate[];
  kits: readonly { id: string; items: readonly { docName: string }[] }[];
  allDraftSlugs: readonly string[];
}): Registry {
  const candBySlug = new Map(args.candidates.map((c) => [c.slug, c]));
  const kitsByDoc = new Map<string, string[]>();
  for (const k of args.kits) for (const i of k.items) kitsByDoc.set(i.docName, [...(kitsByDoc.get(i.docName) ?? []), k.id]);

  const entries: RegistryEntry[] = args.inputs.map((inp) => {
    const kits = kitsByDoc.get(inp.catalogName) ?? [];
    if (!inp.text || !inp.draftSlug) {
      return {
        ...inp, draftSlug: inp.draftSlug, sourceVersion: "v1-original", candidateVersion: null, scope: "not_available",
        status: "no_full_text", findings: [], unverifiedCitations: [], unresolvedFacts: ["Няма пълен текст в каталога — документът не може да бъде проверен."],
        checks: { rules: 0, bracketImbalance: 0, placeholders: 0 }, historicalAcceptance: null, candidateLegalApproval: null, kits,
      } as RegistryEntry;
    }
    const findings = scanTemplateText(inp.text);
    const cand = candBySlug.get(inp.draftSlug);
    let status: RegistryStatus = findings.length ? "scanned_findings_open" : "scanned_no_rule_findings";
    let scope: RegenScope = "scanned_only";
    if (cand && inp.resolution === "fuzzy") {
      scope = "fallback_other_template";
      status = "scope_mismatch_fallback_template";
    } else if (cand) {
      scope = "rewritten";
      status = cand.baseSourceSha256 === inp.sourceSha256 ? "rewritten_candidate_pending_legal_review" : "candidate_stale_source_changed";
    }
    return {
      catalogName: inp.catalogName, categoryId: inp.categoryId, catalogSlug: inp.catalogSlug, draftSlug: inp.draftSlug, resolution: inp.resolution,
      sourceSha256: inp.sourceSha256, sourceVersion: "v1-original", candidateVersion: cand?.version ?? null, scope, status, findings,
      unverifiedCitations: extractCitations(inp.text),
      unresolvedFacts: cand ? [...cand.unresolvedFacts] : [],
      checks: { rules: 0, bracketImbalance: bracketImbalance(inp.text), placeholders: (inp.text.match(/\[[^[\]]+\]/g) ?? []).length },
      historicalAcceptance: "owner_reported_catalog_level_2026-09-28", candidateLegalApproval: null, kits,
    };
  });
  for (const e of entries) if (e.scope !== "not_available") e.checks.rules = CATALOG_RULES.length;

  const byName = new Map(entries.map((e) => [e.catalogName, e]));
  const kits: KitDependency[] = args.kits.map((k) => {
    const items = k.items.map((i) => i.docName);
    const changed = items.filter((n) => byName.get(n)?.scope === "rewritten");
    const contradictions: string[] = [];
    const waiverItems = items.filter((n) => byName.get(n)?.findings.some((f) => f.category === "blanket_waiver"));
    const hasProtocol = items.some((n) => /протокол/i.test(n));
    if (waiverItems.length && hasProtocol) {
      contradictions.push(`Общо изявление за липса на претенции в „${waiverItems.join("“, „")}“ противоречи на протокол със забележки.`);
    }
    return { kitId: k.id, items, status: changed.length || contradictions.length ? "needs_recheck" : "unchanged", changedItems: changed, contradictions };
  });

  const resolved = new Set(entries.map((e) => e.draftSlug).filter(Boolean) as string[]);
  const orphanDraftSlugs = args.allDraftSlugs.filter((s) => !resolved.has(s)).sort();
  const duplicateDraftSlugs: string[][] = [];
  const sorted = [...args.allDraftSlugs].sort();
  for (const s of sorted) {
    const longer = sorted.filter((o) => o !== s && o.startsWith(s) && s.length >= 60);
    if (longer.length) duplicateDraftSlugs.push([s, ...longer]);
  }

  const withText = entries.filter((e) => e.scope !== "not_available");
  return {
    generatedFor: args.date,
    totals: {
      catalogEntries: entries.length,
      withFullText: withText.length,
      withoutFullText: entries.length - withText.length,
      distinctDraftFiles: args.allDraftSlugs.length,
      reachableDraftFiles: resolved.size,
      draftFilesSharedByEntries: [...resolved].filter((s) => entries.filter((e) => e.draftSlug === s).length > 1).length,
      rewrittenDraftFiles: new Set(entries.filter((e) => e.scope === "rewritten").map((e) => e.draftSlug)).size,
      rewrittenCandidates: entries.filter((e) => e.scope === "rewritten").length,
      fuzzyResolvedEntries: entries.filter((e) => e.resolution === "fuzzy").length,
      scopeMismatchEntries: entries.filter((e) => e.scope === "fallback_other_template").length,
      scannedOnly: entries.filter((e) => e.scope === "scanned_only").length,
      entriesWithOpenFindings: entries.filter((e) => (e.scope === "scanned_only" || e.scope === "fallback_other_template") && e.findings.length).length,
      legalErrorFindings: entries.filter((e) => e.scope === "scanned_only").reduce((n, e) => n + e.findings.filter((f) => f.severity === "legal_error").length, 0),
      legallyApprovedCandidates: 0,
    },
    entries, kits, duplicateDraftSlugs, orphanDraftSlugs,
  };
}
