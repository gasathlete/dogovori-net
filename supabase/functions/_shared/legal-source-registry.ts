// N0 — затворен, code-owned регистър на ОФИЦИАЛНИ нормативни източници.
//
// Правила, които този модул налага:
//   * Никакъв URL от потребител. Само точно тези HTTPS origin-и и пътища.
//   * Lex.bg НЕ е официален наблюдаван източник. Съществуващите Lex URL-и в
//     public.legal_sources са ЛЕГАСИ метаданни на корпуса и остават както са —
//     този регистър не ги преозначава като официални.
//   * Ако точен официален endpoint не е проверен, източникът се регистрира
//     `enabled: false` + `reviewStatus: "needs_access_review"`. Никога не се
//     измисля URL.
//   * Никакво обхождане на публични коментари, профили или прикачени файлове
//     извън изрично разрешените пътища. Никакво заобикаляне на auth/CAPTCHA/paywall.

export type Jurisdiction = "BG" | "EU";

export type AuthorityTier =
  | "official_promulgation"
  | "official_legislative_process"
  | "official_consultation"
  | "official_eu_publication"
  | "official_eu_consolidated_helper";

export type AccessMethod = "rss" | "html_index" | "json_api" | "sparql" | "file_export";

export type ReviewStatus = "approved" | "needs_access_review" | "rejected";

export type ExpectedCadence = "hourly" | "daily" | "weekly" | "monthly" | "irregular";

export type AdapterId =
  | "bg_state_gazette_index"
  | "bg_national_assembly_index"
  | "bg_strategy_consultations_rss"
  | "eu_eurlex_oj_index"
  | "eu_cellar_sparql";

export interface LegalSourceEntry {
  readonly sourceKey: string;
  readonly title: string;
  readonly jurisdiction: Jurisdiction;
  readonly authorityTier: AuthorityTier;
  /** Точен HTTPS origin. Fetch извън него се отказва. */
  readonly origin: string;
  /** Основен вход за проверка (винаги започва с "/"). */
  readonly entryPath: string;
  /** Разрешени префикси на пътища за този адаптер (entryPath включително). */
  readonly allowedPathPrefixes: readonly string[];
  readonly accessMethod: AccessMethod;
  readonly adapterId: AdapterId;
  readonly enabled: boolean;
  /** true → източникът е само за наблюдение/предложения, никога „действащо право“. */
  readonly watchOnly: boolean;
  readonly reviewStatus: ReviewStatus;
  readonly owner: string;
  readonly reviewNotes: string;
  readonly expectedCadence: ExpectedCadence;
  readonly parserVersion: string;
  readonly allowedContentTypes: readonly string[];
  /** Максимален размер на отговора в байтове за този източник. */
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

const HTML_TYPES = ["text/html", "application/xhtml+xml"] as const;
const XML_TYPES = ["application/rss+xml", "application/xml", "text/xml", "application/atom+xml"] as const;

export const LEGAL_SOURCE_REGISTRY: readonly LegalSourceEntry[] = Object.freeze([
  {
    sourceKey: "bg_state_gazette",
    title: "Държавен вестник (dv.parliament.bg) — официално обнародване",
    jurisdiction: "BG",
    authorityTier: "official_promulgation",
    origin: "https://dv.parliament.bg",
    entryPath: "/",
    allowedPathPrefixes: ["/DVWeb/", "/"],
    accessMethod: "html_index",
    adapterId: "bg_state_gazette_index",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Единственият авторитетен източник за обнародване. Точният машинно четим index/RSS endpoint още не е проверен от нас, затова източникът е регистриран изключен до писмено потвърждение за условията за ползване и стабилен endpoint.",
    expectedCadence: "weekly",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 2_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "bg_national_assembly",
    title: "Народно събрание — официален законодателен процес",
    jurisdiction: "BG",
    authorityTier: "official_legislative_process",
    origin: "https://www.parliament.bg",
    entryPath: "/bg/laws",
    allowedPathPrefixes: ["/bg/laws", "/bg/bills"],
    accessMethod: "html_index",
    adapterId: "bg_national_assembly_index",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Приети/внесени законопроекти. Само наблюдение: приемането не е обнародване и никога не поражда „действащо право“ в системата.",
    expectedCadence: "weekly",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 2_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "bg_strategy_consultations",
    title: "Strategy.bg — обществени консултации (само watchlist)",
    jurisdiction: "BG",
    authorityTier: "official_consultation",
    origin: "https://www.strategy.bg",
    entryPath: "/PublicConsultations",
    allowedPathPrefixes: ["/PublicConsultations"],
    accessMethod: "rss",
    adapterId: "bg_strategy_consultations_rss",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Само проекти за нормативни актове. НИКОГА не се четат публични коментари, профили или прикачени файлове. Всеки елемент е lifecycle=proposed.",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: [...XML_TYPES, ...HTML_TYPES],
    maxBytes: 1_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "eu_eurlex_oj",
    title: "EUR-Lex / Официален вестник на ЕС — автентична публикация",
    jurisdiction: "EU",
    authorityTier: "official_eu_publication",
    origin: "https://eur-lex.europa.eu",
    entryPath: "/oj/direct-access.html",
    allowedPathPrefixes: ["/oj/", "/legal-content/"],
    accessMethod: "html_index",
    adapterId: "eu_eurlex_oj_index",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Авторитетен е само електронният OJ. Консолидираните текстове са помощни и НЕ са автентични — те се маркират отделно (official_eu_consolidated_helper).",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
  },
  {
    sourceKey: "eu_cellar_metadata",
    title: "CELLAR (publications.europa.eu) — официални метаданни/консолидации",
    jurisdiction: "EU",
    authorityTier: "official_eu_consolidated_helper",
    origin: "https://publications.europa.eu",
    entryPath: "/webapi/rdf/sparql",
    allowedPathPrefixes: ["/webapi/rdf/sparql", "/resource/cellar"],
    accessMethod: "sparql",
    adapterId: "eu_cellar_sparql",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Помощен източник за метаданни и консолидации. Консолидираният текст е НЕАВТЕНТИЧЕН; за автентичност винаги се сочи OJ.",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: ["application/sparql-results+json", "application/json", ...XML_TYPES],
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
  },
] as const satisfies readonly LegalSourceEntry[]);

/** Точен, затворен списък на разрешените origin-и. Lex.bg НЕ е тук. */
export const ALLOWED_ORIGINS: readonly string[] = Object.freeze(
  Array.from(new Set(LEGAL_SOURCE_REGISTRY.map((e) => e.origin))).sort(),
);

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}

export function getRegistryEntry(sourceKey: string): LegalSourceEntry | null {
  return LEGAL_SOURCE_REGISTRY.find((e) => e.sourceKey === sourceKey) ?? null;
}

export function enabledSources(): readonly LegalSourceEntry[] {
  return LEGAL_SOURCE_REGISTRY.filter((e) => e.enabled && e.reviewStatus === "approved");
}

/** Ред за идемпотентен upsert в public.legal_source_registry (без мрежа). */
export interface RegistrySyncRow {
  source_key: string;
  title: string;
  jurisdiction: Jurisdiction;
  authority_tier: AuthorityTier;
  origin: string;
  entry_path: string;
  access_method: AccessMethod;
  enabled: boolean;
  watch_only: boolean;
  review_status: ReviewStatus;
  owner: string;
  review_notes: string;
  expected_cadence: ExpectedCadence;
  parser_version: string;
}

export function registrySyncRows(): RegistrySyncRow[] {
  return LEGAL_SOURCE_REGISTRY.map((e) => ({
    source_key: e.sourceKey,
    title: e.title,
    jurisdiction: e.jurisdiction,
    authority_tier: e.authorityTier,
    origin: e.origin,
    entry_path: e.entryPath,
    access_method: e.accessMethod,
    // Fail-closed: изключен, докато условията/достъпът не са одобрени.
    enabled: e.enabled && e.reviewStatus === "approved",
    watch_only: e.watchOnly,
    review_status: e.reviewStatus,
    owner: e.owner,
    review_notes: e.reviewNotes.slice(0, 2000),
    expected_cadence: e.expectedCadence,
    parser_version: e.parserVersion,
  }));
}
