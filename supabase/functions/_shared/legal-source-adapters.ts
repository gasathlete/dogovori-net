// N0 — адаптери за официални източници: по един на източник, всеки връща
// ЕДИН И СЪЩИ затворен нормализиран envelope.
//
// Инварианти:
//   * Входът е недоверен текст. Никога не се изпълнява и никога не се
//     интерпретира като инструкция; евентуален prompt-подобен текст остава
//     инертно съдържание в `summary`.
//   * Отделни състояния: proposed / promulgated / effective / repealed /
//     corrected / unknown. Никога не се извежда "действащо право" от
//     законопроект, консултация, timestamp на страница или резюме.
//   * Дата на обнародване и дата на влизане в сила са РАЗЛИЧНИ полета.
//     Отложено влизане в сила се запазва като отделна, изрично намерена дата.
//   * Двусмислие или дрейф на схемата => parserStatus needs_review/parser_error.
//     Никакъв фалшив успех, никакво падане към неофициален източник.

export type ChangeLifecycle =
  | "proposed"
  | "promulgated"
  | "effective"
  | "repealed"
  | "corrected"
  | "unknown";

export type Severity = "info" | "watch" | "material" | "critical";

export type ParserStatus = "ok" | "needs_review" | "parser_error";

export type ParserErrorCode =
  | "empty_input"
  | "unrecognized_schema"
  | "no_items_found"
  | "item_cap_exceeded"
  | "unsupported_content_type"
  | "ambiguous_dates";

export interface NormalizedItem {
  lifecycle: ChangeLifecycle;
  /** Стабилен ключ за идемпотентност в рамките на един snapshot. */
  itemKey: string;
  officialIdentifier: string | null;
  celex: string | null;
  gazetteIssue: string | null;
  title: string;
  /** Дата на публикуване/обнародване. null, ако не е намерена изрично. */
  publicationDate: string | null;
  /** Дата на влизане в сила. null, ако не е намерена изрично. */
  effectiveDate: string | null;
  severity: Severity;
  summary: string;
}

export interface AdapterEnvelope {
  sourceKey: string;
  adapterId: string;
  parserVersion: string;
  parserStatus: ParserStatus;
  errorCode: ParserErrorCode | null;
  items: NormalizedItem[];
}

export const MAX_ITEMS = 50;
export const MAX_TITLE = 500;
export const MAX_SUMMARY = 4000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Прави произволен външен текст безопасна, ограничена по дължина ДАННА стойност. */
export function sanitizeExternalText(raw: string, maxLen: number): string {
  return raw
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Приема САМО еднозначни дати. Никакво отгатване. */
export function parseExplicitDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (ISO_DATE.test(s)) {
    const [, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return s;
    return null;
  }
  const bg = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:г\.?)?$/);
  if (bg) {
    const d = Number(bg[1]);
    const m = Number(bg[2]);
    const y = Number(bg[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1878 || y > 2200) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function fail(
  sourceKey: string,
  adapterId: string,
  parserVersion: string,
  errorCode: ParserErrorCode,
  status: ParserStatus = "parser_error",
): AdapterEnvelope {
  return { sourceKey, adapterId, parserVersion, parserStatus: status, errorCode, items: [] };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d{1,6});/g, (_m, n) => String.fromCharCode(Number(n)));
}

function textOf(html: string, maxLen: number): string {
  return sanitizeExternalText(decodeEntities(stripTags(html)), maxLen);
}

// ------------------------------------------------------------------
// Държавен вестник — официално обнародване
// ------------------------------------------------------------------
// Очаквана реална форма: списък с елементи, всеки с брой на ДВ и дата.
// Разпознава и извънреден брой ("извънреден брой 12").
export function parseStateGazetteIndex(raw: string, parserVersion = "v1"): AdapterEnvelope {
  const key = "bg_state_gazette";
  const adapter = "bg_state_gazette_index";
  if (!raw || raw.trim().length < 20) return fail(key, adapter, parserVersion, "empty_input");
  if (!/<\s*(html|body|div|ul|table)\b/i.test(raw)) {
    return fail(key, adapter, parserVersion, "unrecognized_schema");
  }

  const blocks = raw.match(/<li\b[\s\S]*?<\/li>|<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  if (blocks.length === 0) return fail(key, adapter, parserVersion, "no_items_found");
  if (blocks.length > MAX_ITEMS) return fail(key, adapter, parserVersion, "item_cap_exceeded");

  const items: NormalizedItem[] = [];
  let needsReview = false;

  for (const block of blocks) {
    const text = textOf(block, 2000);
    const issueMatch = text.match(/(извънреден\s+брой|брой)\s*[:№]?\s*(\d{1,3})\s*(?:от)?\s*(\d{4})?/i);
    if (!issueMatch) {
      needsReview = true;
      continue;
    }
    const extraordinary = /извънреден/i.test(issueMatch[1]);
    const publication = parseExplicitDate(
      (text.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/) ?? [])[1] ?? null,
    );
    // Влизане в сила се приема САМО при изричен текст (отложено влизане в сила).
    const effRaw = text.match(
      /влиза\s+в\s+сила\s+(?:от\s+)?(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/i,
    );
    const effective = parseExplicitDate(effRaw?.[1] ?? null);
    const corrected = /поправка|техническа\s+грешка/i.test(text);
    const repealed = /отменя\s+се|отменен/i.test(text);

    const year = issueMatch[3] ?? (publication ? publication.slice(0, 4) : "unknown");
    const issueLabel = `${extraordinary ? "извънреден " : ""}бр. ${issueMatch[2]}/${year}`;

    items.push({
      lifecycle: corrected ? "corrected" : repealed ? "repealed" : "promulgated",
      itemKey: sanitizeExternalText(`dv:${year}:${extraordinary ? "x" : "n"}:${issueMatch[2]}`, 200),
      officialIdentifier: issueLabel,
      celex: null,
      gazetteIssue: sanitizeExternalText(issueLabel, 60),
      title: textOf(block, MAX_TITLE) || issueLabel,
      publicationDate: publication,
      effectiveDate: effective,
      severity: extraordinary ? "critical" : "material",
      summary: textOf(block, MAX_SUMMARY),
    });
  }

  if (items.length === 0) return fail(key, adapter, parserVersion, "unrecognized_schema");
  return {
    sourceKey: key,
    adapterId: adapter,
    parserVersion,
    parserStatus: needsReview ? "needs_review" : "ok",
    errorCode: needsReview ? "unrecognized_schema" : null,
    items: dedupeItems(items),
  };
}

// ------------------------------------------------------------------
// Народно събрание — законодателен процес (само наблюдение)
// ------------------------------------------------------------------
export function parseNationalAssemblyIndex(raw: string, parserVersion = "v1"): AdapterEnvelope {
  const key = "bg_national_assembly";
  const adapter = "bg_national_assembly_index";
  if (!raw || raw.trim().length < 20) return fail(key, adapter, parserVersion, "empty_input");
  if (!/<\s*(html|body|div|ul|table)\b/i.test(raw)) {
    return fail(key, adapter, parserVersion, "unrecognized_schema");
  }
  const blocks = raw.match(/<li\b[\s\S]*?<\/li>|<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  if (blocks.length === 0) return fail(key, adapter, parserVersion, "no_items_found");
  if (blocks.length > MAX_ITEMS) return fail(key, adapter, parserVersion, "item_cap_exceeded");

  const items: NormalizedItem[] = [];
  for (const block of blocks) {
    const text = textOf(block, 2000);
    if (text.length < 5) continue;
    const sig = text.match(/№\s*([0-9\-/]{2,40})/);
    items.push({
      // Законодателен процес НИКОГА не е действащо право.
      lifecycle: "proposed",
      itemKey: sanitizeExternalText(`na:${sig?.[1] ?? text.slice(0, 80)}`, 200),
      officialIdentifier: sig ? sanitizeExternalText(sig[1], 200) : null,
      celex: null,
      gazetteIssue: null,
      title: textOf(block, MAX_TITLE),
      publicationDate: parseExplicitDate((text.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/) ?? [])[1] ?? null),
      // Инвариант: предложение не носи дата на влизане в сила.
      effectiveDate: null,
      severity: "watch",
      summary: textOf(block, MAX_SUMMARY),
    });
  }
  if (items.length === 0) return fail(key, adapter, parserVersion, "unrecognized_schema");
  return {
    sourceKey: key,
    adapterId: adapter,
    parserVersion,
    parserStatus: "ok",
    errorCode: null,
    items: dedupeItems(items),
  };
}

// ------------------------------------------------------------------
// Strategy.bg — обществени консултации (RSS, само watchlist)
// ------------------------------------------------------------------
export function parseStrategyConsultationsRss(raw: string, parserVersion = "v1"): AdapterEnvelope {
  const key = "bg_strategy_consultations";
  const adapter = "bg_strategy_consultations_rss";
  if (!raw || raw.trim().length < 20) return fail(key, adapter, parserVersion, "empty_input");
  if (!/<\s*(rss|feed)\b/i.test(raw)) return fail(key, adapter, parserVersion, "unrecognized_schema");

  const entries = raw.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  if (entries.length === 0) return fail(key, adapter, parserVersion, "no_items_found");
  if (entries.length > MAX_ITEMS) return fail(key, adapter, parserVersion, "item_cap_exceeded");

  const items: NormalizedItem[] = [];
  for (const e of entries) {
    const title = textOf((e.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "", MAX_TITLE);
    if (title.length < 3) continue;
    const guid = textOf((e.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) ?? [])[1] ?? "", 200);
    const pub = textOf((e.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ?? [])[1] ?? "", 60);
    const desc = textOf((e.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ?? [])[1] ?? "", MAX_SUMMARY);
    items.push({
      // Консултация = само предложение. Никога обнародване/действащо право.
      lifecycle: "proposed",
      itemKey: sanitizeExternalText(`sbg:${guid || title.slice(0, 120)}`, 200),
      officialIdentifier: guid || null,
      celex: null,
      gazetteIssue: null,
      title,
      publicationDate: parseExplicitDate(
        (pub.match(/\b(\d{4}-\d{2}-\d{2})\b/) ?? pub.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/) ?? [])[1] ?? null,
      ),
      effectiveDate: null,
      severity: "watch",
      summary: desc,
    });
  }
  if (items.length === 0) return fail(key, adapter, parserVersion, "unrecognized_schema");
  return {
    sourceKey: key,
    adapterId: adapter,
    parserVersion,
    parserStatus: "ok",
    errorCode: null,
    items: dedupeItems(items),
  };
}

// ------------------------------------------------------------------
// EUR-Lex / OJ — автентична публикация на ЕС
// ------------------------------------------------------------------
const CELEX_RX = /\b([0-9]{1}[0-9]{4}[A-Z]{1,2}[0-9]{4}(?:\([0-9]{2}\))?)\b/;

export function parseEurLexOjIndex(raw: string, parserVersion = "v1"): AdapterEnvelope {
  const key = "eu_eurlex_oj";
  const adapter = "eu_eurlex_oj_index";
  if (!raw || raw.trim().length < 20) return fail(key, adapter, parserVersion, "empty_input");
  if (!/<\s*(html|body|div|ul|table|rss|feed)\b/i.test(raw)) {
    return fail(key, adapter, parserVersion, "unrecognized_schema");
  }
  const blocks =
    raw.match(/<li\b[\s\S]*?<\/li>|<tr\b[\s\S]*?<\/tr>|<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  if (blocks.length === 0) return fail(key, adapter, parserVersion, "no_items_found");
  if (blocks.length > MAX_ITEMS) return fail(key, adapter, parserVersion, "item_cap_exceeded");

  const items: NormalizedItem[] = [];
  let needsReview = false;
  for (const block of blocks) {
    const text = textOf(block, 2000);
    const celex = (text.match(CELEX_RX) ?? [])[1] ?? null;
    if (!celex) {
      needsReview = true;
      continue;
    }
    const publication = parseExplicitDate((text.match(/\b(\d{4}-\d{2}-\d{2})\b/) ?? [])[1] ?? null);
    const effRaw = text.match(
      /(?:enters?\s+into\s+force|shall\s+apply)\s+(?:on|from)\s+(\d{4}-\d{2}-\d{2})/i,
    );
    const repealed = /\brepealed\b|\brepealing\b/i.test(text);
    const corrigendum = /\bcorrigend/i.test(text);
    items.push({
      lifecycle: corrigendum ? "corrected" : repealed ? "repealed" : "promulgated",
      itemKey: sanitizeExternalText(`celex:${celex}`, 200),
      officialIdentifier: celex,
      celex,
      // Взаимно изключващи се идентификатори (виж lcc_celex_xor_gazette_chk).
      gazetteIssue: null,
      title: textOf(block, MAX_TITLE),
      publicationDate: publication,
      effectiveDate: parseExplicitDate(effRaw?.[1] ?? null),
      severity: corrigendum ? "info" : "material",
      summary: textOf(block, MAX_SUMMARY),
    });
  }
  if (items.length === 0) return fail(key, adapter, parserVersion, "unrecognized_schema");
  return {
    sourceKey: key,
    adapterId: adapter,
    parserVersion,
    parserStatus: needsReview ? "needs_review" : "ok",
    errorCode: needsReview ? "unrecognized_schema" : null,
    items: dedupeItems(items),
  };
}

// ------------------------------------------------------------------
// CELLAR SPARQL — помощни метаданни (консолидации: НЕАВТЕНТИЧНИ)
// ------------------------------------------------------------------
export function parseCellarSparqlJson(rawBody: string, parserVersion = "v1"): AdapterEnvelope {
  const key = "eu_cellar_metadata";
  const adapter = "eu_cellar_sparql";
  if (!rawBody || rawBody.trim().length < 2) return fail(key, adapter, parserVersion, "empty_input");
  let json: unknown;
  try {
    // Външно съдържание: инертни данни, никога инструкции.
    json = JSON.parse(rawBody);
  } catch {
    return fail(key, adapter, parserVersion, "unrecognized_schema");
  }
  const bindings = (json as { results?: { bindings?: unknown } })?.results?.bindings;
  if (!Array.isArray(bindings)) return fail(key, adapter, parserVersion, "unrecognized_schema");
  if (bindings.length === 0) return fail(key, adapter, parserVersion, "no_items_found");
  if (bindings.length > MAX_ITEMS) return fail(key, adapter, parserVersion, "item_cap_exceeded");

  const val = (row: Record<string, unknown>, k: string): string | null => {
    const cell = row[k] as { value?: unknown } | undefined;
    return typeof cell?.value === "string" ? cell.value : null;
  };

  const items: NormalizedItem[] = [];
  for (const rowRaw of bindings) {
    if (typeof rowRaw !== "object" || rowRaw === null) return fail(key, adapter, parserVersion, "unrecognized_schema");
    const row = rowRaw as Record<string, unknown>;
    const celexRaw = val(row, "celex");
    const title = sanitizeExternalText(val(row, "title") ?? "", MAX_TITLE);
    if (!celexRaw || title.length < 3) return fail(key, adapter, parserVersion, "unrecognized_schema");
    const celex = sanitizeExternalText(celexRaw, 60).toUpperCase();
    if (!/^[0-9A-Z()]{4,60}$/.test(celex)) return fail(key, adapter, parserVersion, "unrecognized_schema");
    items.push({
      // Метаданните за консолидация не доказват влизане в сила.
      lifecycle: "unknown",
      itemKey: sanitizeExternalText(`cellar:${celex}`, 200),
      officialIdentifier: celex,
      celex,
      gazetteIssue: null,
      title,
      publicationDate: parseExplicitDate(val(row, "date_document")),
      effectiveDate: parseExplicitDate(val(row, "date_force")),
      severity: "info",
      summary: sanitizeExternalText(
        `CELLAR consolidated metadata (non-authentic helper). ${val(row, "note") ?? ""}`,
        MAX_SUMMARY,
      ),
    });
  }
  return {
    sourceKey: key,
    adapterId: adapter,
    parserVersion,
    parserStatus: "ok",
    errorCode: null,
    items: dedupeItems(items),
  };
}

function dedupeItems(items: NormalizedItem[]): NormalizedItem[] {
  const seen = new Set<string>();
  const out: NormalizedItem[] = [];
  for (const it of items) {
    if (seen.has(it.itemKey)) continue;
    seen.add(it.itemKey);
    out.push(it);
  }
  return out;
}

export type AdapterFn = (raw: string, parserVersion?: string) => AdapterEnvelope;

export const ADAPTERS: Readonly<Record<string, AdapterFn>> = Object.freeze({
  bg_state_gazette_index: parseStateGazetteIndex,
  bg_national_assembly_index: parseNationalAssemblyIndex,
  bg_strategy_consultations_rss: parseStrategyConsultationsRss,
  eu_eurlex_oj_index: parseEurLexOjIndex,
  eu_cellar_sparql: parseCellarSparqlJson,
});

export function runAdapter(adapterId: string, raw: string, parserVersion = "v1"): AdapterEnvelope {
  const fn = ADAPTERS[adapterId];
  if (!fn) {
    return {
      sourceKey: "unknown",
      adapterId,
      parserVersion,
      parserStatus: "parser_error",
      errorCode: "unsupported_content_type",
      items: [],
    };
  }
  try {
    return fn(raw, parserVersion);
  } catch {
    return {
      sourceKey: "unknown",
      adapterId,
      parserVersion,
      parserStatus: "parser_error",
      errorCode: "unrecognized_schema",
      items: [],
    };
  }
}
