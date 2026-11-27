// Split a Bulgarian normative act into article-level chunks.
// Heuristics: "Чл. N" / "Чл. N." / "Член N" mark articles; "Ал. N" / "(N)" mark
// paragraphs inside an article. Headings (Раздел, Глава, Част) accumulate as
// breadcrumb path. Each chunk is targeted at 400-1500 chars; longer articles
// are split at paragraph boundaries.

export interface ChunkInput {
  raw_text: string;
  short_code: string;          // e.g. "ЗЗД"
  source_title: string;        // e.g. "Закон за задълженията и договорите"
  language?: string;           // default "bg"
}

export interface NormChunk {
  article_no: string | null;
  paragraph_no: string | null;
  heading_path: string[];
  citation_label: string;
  content: string;
  chunk_index: number;
}

const ARTICLE_RE = /^(?:чл\.?|член)\s*(\d+[а-я]?(?:\s*[a-я]?)?)\.?\s*/i;
const HEADING_RE = /^(част|глава|раздел|подраздел|дял)\s+[ivxlcdm\d]+/i;
const PARA_RE = /^(?:ал\.?|алинея)\s*(\d+)/i;
const NUMERIC_PARA_RE = /^\((\d+)\)\s*/;

export function chunkBgAct(input: ChunkInput): NormChunk[] {
  const lines = input.raw_text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim());

  const headingPath: string[] = [];
  const articles: Array<{
    article_no: string;
    heading_path: string[];
    body: string[];
  }> = [];

  let current: typeof articles[number] | null = null;

  for (const line of lines) {
    if (!line) {
      if (current) current.body.push("");
      continue;
    }

    if (HEADING_RE.test(line)) {
      // Reset breadcrumbs at top-level headings
      const lower = line.toLowerCase();
      if (lower.startsWith("част") || lower.startsWith("дял")) headingPath.length = 0;
      else if (lower.startsWith("глава")) headingPath.splice(1);
      else if (lower.startsWith("раздел")) headingPath.splice(2);
      headingPath.push(line);
      continue;
    }

    const m = line.match(ARTICLE_RE);
    if (m) {
      current = {
        article_no: m[1].replace(/\s+/g, ""),
        heading_path: [...headingPath],
        body: [line.replace(ARTICLE_RE, "").trim()].filter(Boolean),
      };
      articles.push(current);
      continue;
    }

    if (current) current.body.push(line);
  }

  const out: NormChunk[] = [];
  const MAX_CHARS = 1400;
  let idx = 0;

  for (const a of articles) {
    const text = a.body.join("\n").trim();
    if (!text) continue;

    if (text.length <= MAX_CHARS) {
      out.push({
        article_no: a.article_no,
        paragraph_no: null,
        heading_path: a.heading_path,
        citation_label: `${input.short_code}, чл. ${a.article_no}`,
        content: text,
        chunk_index: idx++,
      });
      continue;
    }

    // Long article — split by paragraphs (Ал. N) or numeric "(N)" markers.
    const paraLines = text.split("\n");
    let curPara: { no: string | null; lines: string[] } = { no: null, lines: [] };
    const flush = () => {
      const content = curPara.lines.join("\n").trim();
      if (!content) return;
      out.push({
        article_no: a.article_no,
        paragraph_no: curPara.no,
        heading_path: a.heading_path,
        citation_label: curPara.no
          ? `${input.short_code}, чл. ${a.article_no}, ал. ${curPara.no}`
          : `${input.short_code}, чл. ${a.article_no}`,
        content,
        chunk_index: idx++,
      });
    };

    for (const line of paraLines) {
      const p1 = line.match(PARA_RE);
      const p2 = !p1 ? line.match(NUMERIC_PARA_RE) : null;
      if (p1 || p2) {
        flush();
        curPara = { no: (p1?.[1] ?? p2?.[1]) ?? null, lines: [line] };
      } else {
        curPara.lines.push(line);
        if (curPara.lines.join("\n").length > MAX_CHARS) {
          flush();
          curPara = { no: curPara.no, lines: [] };
        }
      }
    }
    flush();
  }

  return out;
}

// SHA-256 hex of input text — used as version key for idempotent ingest.
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
