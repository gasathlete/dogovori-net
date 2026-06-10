// Shared retrieval helper for grounding AI calls in the legal knowledge base.
// All AI operations (assistant-chat, analyze-contract, build-custom-contract,
// generate-contract, apply-corrections, correct-uploaded) call retrieveLegalContext()
// before invoking the LLM and append the results to the system prompt so the
// model answers ONLY from indexed normative sources with citations.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  const minSim = opts.minSimilarity ?? 0;
  const rows = (data as Array<Record<string, unknown>>) ?? [];

  const enriched = rows
    .filter((r) => Number(r.similarity) >= minSim || Number(r.text_rank) > 0)
    .map((r, idx) => ({
      _idx: idx + 1,
      chunk_id: String(r.chunk_id),
      citation_label: String(r.citation_label),
      short_code: String(r.source_short_code ?? ""),
      title: String(r.source_title ?? ""),
      article_no: r.article_no ? String(r.article_no) : null,
      paragraph_no: r.paragraph_no ? String(r.paragraph_no) : null,
      official_url: r.official_url ? String(r.official_url) : null,
      jurisdiction: (String(r.jurisdiction) === "EU" ? "EU" : "BG") as "BG" | "EU",
      similarity: Number(r.similarity) || 0,
      content: String(r.content),
    }));

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
