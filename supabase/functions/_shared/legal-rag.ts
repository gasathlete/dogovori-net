// Shared retrieval helper for grounding AI calls in the legal knowledge base.
// All AI operations (assistant-chat, analyze-contract, build-custom-contract,
// generate-contract, apply-corrections, correct-uploaded) call retrieveLegalContext()
// before invoking the LLM and append the results to the system prompt so the
// model answers ONLY from indexed normative sources with citations.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isStrictLegalKnowledgeBaseReady,
  type StrictLegalDb,
  verifyLegalChunk,
  type VerifierDeps,
} from "./legal-verification.ts";

const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 768;

export interface LegalCitation {
  chunk_id: string;
  citation_label: string;
  short_code: string;
  title: string;
  article_no: string | null;
  paragraph_no: string | null;
  official_url: string | null;
  jurisdiction: "BG" | "EU";
  similarity: number;
}

export interface LegalContext {
  chunks: Array<LegalCitation & { content: string }>;
  citations: LegalCitation[];
  promptBlock: string;
  hasMatches: boolean;
}

export interface RetrieveOpts {
  jurisdictions?: ("BG" | "EU")[];
  sourceTypes?: string[];
  matchCount?: number;
  minSimilarity?: number;
  /** Само за тестове: инжектиране на регистър/часовник. */
  verifier?: VerifierDeps;
}

export async function embedText(
  apiKey: string,
  text: string,
): Promise<number[] | null> {
  const trimmed = text.slice(0, 8000).trim();
  if (!trimmed) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: trimmed,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!resp.ok) {
      console.error("embed http", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const json = await resp.json();
    const vec = json?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (e) {
    console.error("embed error", e);
    return null;
  }
}

/**
 * Документиран, консервативен праг за издаване: под него съвпадението не се
 * смята за достатъчно относимо и не влиза в контекста. text_rank НЕ заобикаля
 * прага — лексикално съвпадение само по себе си не е основание.
 *
 * Стойността е нарочно консервативна за пускане в реална употреба. Няма
 * калибровка в кода, която да обосновава по-нисък праг.
 */
export const DEFAULT_MIN_SIMILARITY = 0.5;

/** Детерминиран горен предел на проверките за една заявка. */
export const MAX_VERIFIED_CANDIDATES = 12;

export async function retrieveLegalContext(
  admin: SupabaseClient,
  apiKey: string,
  query: string,
  opts: RetrieveOpts = {},
): Promise<LegalContext> {
  const empty: LegalContext = {
    chunks: [],
    citations: [],
    promptBlock: "",
    hasMatches: false,
  };

  // Fail-closed ПРЕДИ всякаква мрежа: без строга готовност няма embedding,
  // няма RPC, няма доставчик.
  const strictDb = admin as unknown as StrictLegalDb;
  if (!(await isStrictLegalKnowledgeBaseReady(strictDb, opts.verifier))) return empty;

  const vec = await embedText(apiKey, query);
  if (!vec) return empty;

  const { data, error } = await admin.rpc("match_legal_chunks", {
    query_embedding: vec as unknown as string,
    query_text: query,
    jurisdictions: opts.jurisdictions ?? null,
    source_types: opts.sourceTypes ?? null,
    match_count: opts.matchCount ?? 8,
  });

  if (error) {
    console.error("match_legal_chunks rpc error", error);
    return empty;
  }

  // Подаден по-слаб праг от точка на извикване НЕ отслабва изданието.
  const requested = opts.minSimilarity;
  const minSim = typeof requested === "number" && requested > DEFAULT_MIN_SIMILARITY
    ? requested
    : DEFAULT_MIN_SIMILARITY;
  const rows = (data as Array<Record<string, unknown>>) ?? [];

  // Изходът на RPC е само СПИСЪК С КАНДИДАТИ. Всеки кандидат се препрочита и
  // проверява; етикет, връзка и съдържание идват само от сървъра.
  const enriched: Array<{
    _idx: number;
    chunk_id: string;
    citation_label: string;
    short_code: string;
    title: string;
    article_no: string | null;
    paragraph_no: string | null;
    official_url: string | null;
    jurisdiction: "BG" | "EU";
    similarity: number;
    content: string;
  }> = [];

  // Детерминирано: дедупликация по id, най-силните съвпадения първи, таван.
  const bySimilarity = new Map<string, number>();
  for (const r of rows) {
    const chunkId = typeof r.chunk_id === "string" && r.chunk_id.trim() ? r.chunk_id : null;
    if (!chunkId) continue;
    const similarity = Number(r.similarity);
    if (!Number.isFinite(similarity) || !(similarity >= minSim)) continue;
    const prev = bySimilarity.get(chunkId);
    if (prev === undefined || similarity > prev) bySimilarity.set(chunkId, similarity);
  }
  const candidates = [...bySimilarity.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_VERIFIED_CANDIDATES);

  for (const [chunkId, similarity] of candidates) {
    const verified = await verifyLegalChunk(strictDb, chunkId, opts.verifier);
    if (!verified.ok) continue;
    const v = verified.chunk;
    enriched.push({
      _idx: enriched.length + 1,
      chunk_id: v.chunk_id,
      citation_label: v.citation_label,
      short_code: v.short_code,
      title: v.title,
      article_no: v.article_no,
      paragraph_no: v.paragraph_no,
      official_url: v.canonical_url,
      jurisdiction: v.jurisdiction,
      similarity: similarity,
      content: v.content,
    });
  }

  if (enriched.length === 0) return empty;

  const lines: string[] = [];
  lines.push("## РАЗРЕШЕНА НОРМАТИВНА БАЗА (единствен валиден източник)");
  lines.push(
    "Отговаряй ИЗКЛЮЧИТЕЛНО на база следните извадки от българското и европейско законодателство.",
  );
  lines.push("Цитирай номер на източник в квадратни скоби, напр. [S1], [S2].");
  lines.push(
    "Ако в извадките НЯМА основание за пълен отговор, кажи изрично: " +
      '"Няма основание в наличната нормативна база. За конкретния казус се консултирайте с адвокат."',
  );
  lines.push(
    "Никога не цитирай актове извън списъка по-долу. Не измисляй членове, алинеи или съдебни решения.",
  );
  lines.push("");
  for (const c of enriched) {
    const jur = c.jurisdiction === "EU" ? " (ЕС)" : "";
    lines.push(`[S${c._idx}] ${c.citation_label}${jur}:`);
    lines.push(c.content.trim());
    lines.push("");
  }
  lines.push(
    'В края на отговора добави секция "**Източници:**" със списък на използваните [Sn] и пълния citation_label.',
  );
  const promptBlock = lines.join("\n");

  const stripIdx = ({ _idx: _i, content: _c, ...rest }: typeof enriched[number]) => rest;
  const citations: LegalCitation[] = enriched.map(stripIdx);
  const chunks = enriched.map(({ _idx: _i, ...rest }) => rest);

  return { chunks, citations, promptBlock, hasMatches: true };
}
