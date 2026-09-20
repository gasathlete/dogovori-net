/**
 * ТЕСТОВИ фикстури за строгата правна проверка.
 *
 * Не се използва в продукционен код: производственият път винаги ползва
 * code-owned регистъра, в който днес няма нито един одобрен източник.
 */
import { LEGAL_SOURCE_REGISTRY, type LegalSourceEntry } from "./legal-source-registry.ts";
import type { StrictLegalDb, StrictQuery, StrictResult } from "./legal-verification.ts";

export const NOW = Date.parse("2026-09-20T12:00:00Z");
export const FIXED_NOW = () => NOW;

const base = LEGAL_SOURCE_REGISTRY.find((e) => e.sourceKey === "bg_state_gazette")!;

/** Хипотетичен ОДОБРЕН източник — само за тестове. */
export const APPROVED_ENTRY: LegalSourceEntry = Object.freeze({
  ...base,
  enabled: true,
  watchOnly: false,
  reviewStatus: "approved",
});

export const APPROVED_REGISTRY: readonly LegalSourceEntry[] = Object.freeze([APPROVED_ENTRY]);

export const OFFICIAL_URL = "https://dv.parliament.bg/DVWeb/zzd";
export const LEX_URL = "https://lex.bg/laws/zzd";

export const CHUNK_ID = "11111111-1111-4111-8111-111111111111";
export const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
export const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

export interface FixtureRows {
  chunk?: Record<string, unknown> | null;
  /** Повече от един чънк: доказва детерминирано откриване по-късен валиден. */
  chunks?: Array<Record<string, unknown>>;
  document?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
  registry?: Record<string, unknown> | null;
  run?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  error?: unknown;
}

export const READY_ROWS: FixtureRows = Object.freeze({
  chunk: {
    id: CHUNK_ID,
    source_id: SOURCE_ID,
    document_id: DOCUMENT_ID,
    citation_label: "чл. 79, ал. 1 ЗЗД",
    content: "Кредиторът има право да иска изпълнение.",
    article_no: "79",
    paragraph_no: "1",
  },
  document: {
    id: DOCUMENT_ID,
    source_id: SOURCE_ID,
    version: "2026-01-15",
    effective_from: "2026-01-15T00:00:00Z",
    effective_to: null,
  },
  source: {
    id: SOURCE_ID,
    active: true,
    official_url: OFFICIAL_URL,
    current_version: "2026-01-15",
    last_indexed_at: "2026-09-18T00:00:00Z",
    short_code: "ЗЗД",
    title: "Закон за задълженията и договорите",
    jurisdiction: "BG",
  },
  registry: {
    source_key: APPROVED_ENTRY.sourceKey,
    origin: APPROVED_ENTRY.origin,
    jurisdiction: APPROVED_ENTRY.jurisdiction,
    parser_version: APPROVED_ENTRY.parserVersion,
    enabled: true,
    watch_only: false,
    review_status: "approved",
    freshness_state: "fresh",
    last_success_at: "2026-09-19T00:00:00Z",
    expected_cadence: APPROVED_ENTRY.expectedCadence,
  },
  run: {
    source_key: APPROVED_ENTRY.sourceKey,
    outcome: "no_change",
    finished_at: "2026-09-19T00:05:00Z",
    started_at: "2026-09-19T00:00:00Z",
  },
  snapshot: {
    source_key: APPROVED_ENTRY.sourceKey,
    canonical_url: OFFICIAL_URL,
    parser_version: APPROVED_ENTRY.parserVersion,
    retrieved_at: "2026-09-19T00:05:00Z",
  },
});

export interface FixtureDb extends StrictLegalDb {
  /** Брой заявки по таблица — доказва „нула заявки“ при затворена врата. */
  readonly calls: Record<string, number>;
}

/** Минимален, но верен на реалния клиент фалшив достъп до базата. */
export function fixtureDb(rows: FixtureRows = READY_ROWS): FixtureDb {
  const calls: Record<string, number> = {};
  const chunkRows = (): Array<Record<string, unknown>> =>
    rows.chunks ?? (rows.chunk ? [rows.chunk] : []);
  const rowFor = (table: string): Record<string, unknown> | null => {
    switch (table) {
      case "legal_chunks":
        return rows.chunk ?? chunkRows()[0] ?? null;
      case "legal_documents":
        return rows.document ?? null;
      case "legal_sources":
        return rows.source ?? null;
      case "legal_source_registry":
        return rows.registry ?? null;
      case "legal_ingestion_runs":
        return rows.run ?? null;
      case "legal_source_snapshots":
        return rows.snapshot ?? null;
      default:
        return null;
    }
  };
  const db: FixtureDb = {
    calls,
    from(table: string) {
      calls[table] = (calls[table] ?? 0) + 1;
      const filters: Record<string, unknown> = {};
      const all = (): Array<Record<string, unknown>> => {
        if (table === "legal_chunks") return chunkRows();
        const row = rowFor(table);
        return row ? [row] : [];
      };
      const matching = (): Array<Record<string, unknown>> =>
        all().filter((row) =>
          Object.entries(filters).every(([col, val]) =>
            !(col in row) || row[col] === val
          )
        );
      const result = (): StrictResult => ({
        data: matching()[0] ?? null,
        error: rows.error ?? null,
      });
      const list = (): StrictResult => ({ data: matching(), error: rows.error ?? null });
      const query: StrictQuery = {
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        order: () => query,
        limit: () => Promise.resolve(list()),
        range: (from: number, to: number) => Promise.resolve({
          data: matching().slice(from, to + 1),
          error: rows.error ?? null,
        }),
        maybeSingle: () => Promise.resolve(result()),
      };
      return { select: () => query };
    },
  };
  return db;
}
