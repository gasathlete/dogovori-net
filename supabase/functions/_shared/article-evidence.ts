/**
 * ДОКАЗАТЕЛСТВА ЗА ГЕНЕРИРАНА РЕДАКЦИОННА ЧЕРНОВА (append-only).
 *
 * Целта е човешкият проверител после да може да сравни хеша на публикуваното
 * съдържание с хеша на генерираното. Записът НИКОГА не означава, че черновата е
 * проверена: verified остава false, докато човек не потвърди изрично.
 */

export interface ArticleSourceRef {
  chunk_id: string;
  short_code: string;
  version: string | null;
  snapshot_digest: string | null;
}

export interface ArticleEvidence {
  article_id: string;
  content_hash: string;
  prompt_version: string;
  prompt_digest: string;
  policy_version: string;
  model: string;
  generator: string;
  sources: ArticleSourceRef[];
  generated_at: string;
  verified: false;
}

export const ARTICLE_POLICY_VERSION = "legal-gate-2026-09";
export const ARTICLE_PROMPT_VERSION = "admin-article-v2-grounded";

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Канонично съдържание за хеширане — стабилно при повторно сериализиране. */
export function canonicalArticleContent(article: {
  title?: string;
  summary?: string;
  intro?: string;
  sections?: Array<{ heading?: string; body?: string }>;
  faq?: Array<{ q?: string; a?: string }>;
  takeaways?: string[];
}): string {
  const parts: string[] = [
    `TITLE:${(article.title ?? "").trim()}`,
    `SUMMARY:${(article.summary ?? "").trim()}`,
    `INTRO:${(article.intro ?? "").trim()}`,
  ];
  for (const s of article.sections ?? []) {
    parts.push(`SECTION:${(s.heading ?? "").trim()}\n${(s.body ?? "").trim()}`);
  }
  for (const f of article.faq ?? []) {
    parts.push(`FAQ:${(f.q ?? "").trim()}\n${(f.a ?? "").trim()}`);
  }
  for (const t of article.takeaways ?? []) parts.push(`TAKEAWAY:${String(t).trim()}`);
  return parts.join("\n");
}

export function toArticleSourceRefs(
  citations: Array<{ chunk_id?: string; short_code?: string }>,
  versions?: Map<string, { version: string | null; snapshot_digest: string | null }>,
): ArticleSourceRef[] {
  return citations
    .filter((c) => typeof c.chunk_id === "string" && c.chunk_id.length > 0)
    .map((c) => {
      const v = versions?.get(c.chunk_id as string);
      return {
        chunk_id: c.chunk_id as string,
        short_code: c.short_code ?? "",
        version: v?.version ?? null,
        snapshot_digest: v?.snapshot_digest ?? null,
      };
    });
}

export async function buildArticleEvidence(params: {
  articleId: string;
  article: Parameters<typeof canonicalArticleContent>[0];
  activeSystemPrompt: string;
  model: string;
  generator: string;
  sources: ArticleSourceRef[];
  now?: Date;
}): Promise<ArticleEvidence> {
  return {
    article_id: params.articleId,
    content_hash: await sha256Hex(canonicalArticleContent(params.article)),
    prompt_version: ARTICLE_PROMPT_VERSION,
    prompt_digest: await sha256Hex(params.activeSystemPrompt),
    policy_version: ARTICLE_POLICY_VERSION,
    model: params.model,
    generator: params.generator,
    sources: params.sources,
    generated_at: (params.now ?? new Date()).toISOString(),
    verified: false,
  };
}
