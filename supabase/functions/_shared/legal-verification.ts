/**
 * ЕДИН строг проверяващ модул за правна обоснованост (fail-closed).
 *
 * Използва се от:
 *   * product-legal-basis.ts (правно основание за платените продукти)
 *   * legal-rag.ts (общото извличане за AI заявките)
 *
 * Авторитет съществува само когато ЦЯЛАТА верига е доказана:
 *   1. code-owned регистър: enabled + reviewStatus="approved" + watchOnly=false;
 *   2. ред в public.legal_source_registry със същия source_key/origin/
 *      jurisdiction/parser_version, enabled, review_status="approved",
 *      watch_only=false, freshness_state="fresh", last_success_at в рамките на
 *      явен максимален срок според каденцията;
 *   3. последното ingestion изпълнение е приключило с приет изход;
 *   4. има скорошен snapshot с HTTPS URL на точния одобрен origin/път и
 *      съвпадаща версия на парсера;
 *   5. легаси редът в public.legal_sources е активен, с HTTPS official_url на
 *      същия одобрен origin/път, с непразен current_version и скорошен
 *      last_indexed_at (Lex.bg и всеки неодобрен origin се отказват);
 *   6. legal_documents е за същия източник, version === current_version,
 *      effective_from е валидна дата <= сега, effective_to е null или валидна
 *      бъдеща дата;
 *   7. чънкът принадлежи на този документ/източник и има сървърни
 *      citation_label и content.
 *
 * Всяко съмнение, липсваща или неразбираема дата → отказ. Никакви данни от
 * модела не се приемат за факт.
 */

import {
  type ExpectedCadence,
  type LegalSourceEntry,
  LEGAL_SOURCE_REGISTRY,
} from "./legal-source-registry.ts";

const HTTPS_RE = /^https:\/\/[^\s"']+$/;

const DAY = 24 * 60 * 60 * 1000;

/** Явни, тестваеми граници на давност според очакваната каденция. */
export const CADENCE_MAX_AGE_MS: Readonly<Record<ExpectedCadence, number>> = Object.freeze({
  hourly: 6 * 60 * 60 * 1000,
  daily: 3 * DAY,
  weekly: 14 * DAY,
  monthly: 45 * DAY,
  irregular: 45 * DAY,
});

/** Максимална давност на легаси индексирането на корпуса. */
export const LEGACY_INDEX_MAX_AGE_MS = 45 * DAY;
/** Максимална давност на последния официален snapshot. */
export const SNAPSHOT_MAX_AGE_MS = 45 * DAY;

/** Приети изходи на ingestion изпълнение. */
export const ACCEPTED_RUN_OUTCOMES: readonly string[] = Object.freeze([
  "success",
  "no_change",
  "changed",
]);

export type VerificationReason =
  | "registry_entry_missing"
  | "registry_entry_disabled"
  | "registry_row_missing"
  | "registry_row_mismatch"
  | "registry_row_disabled"
  | "registry_row_stale"
  | "ingestion_run_missing"
  | "ingestion_run_not_accepted"
  | "snapshot_missing"
  | "snapshot_untrusted"
  | "legacy_source_missing"
  | "legacy_source_untrusted"
  | "legacy_source_stale"
  | "document_invalid"
  | "document_not_in_force"
  | "chunk_invalid"
  | "db_error";

export interface StrictResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface StrictQuery {
  eq(column: string, value: unknown): StrictQuery;
  order(column: string, opts?: { ascending?: boolean }): StrictQuery;
  limit(count: number): Promise<StrictResult>;
  range(from: number, to: number): Promise<StrictResult>;
  maybeSingle(): Promise<StrictResult>;
}

export interface StrictLegalDb {
  from(table: string): { select(columns: string): StrictQuery };
}

export interface VerifierDeps {
  /** По подразбиране винаги code-owned регистърът. Инжектира се само в тестове. */
  readonly registry?: readonly LegalSourceEntry[];
  readonly now?: () => number;
  readonly cadenceMaxAgeMs?: Readonly<Partial<Record<ExpectedCadence, number>>>;
  readonly legacyIndexMaxAgeMs?: number;
  readonly snapshotMaxAgeMs?: number;
}

interface Resolved {
  readonly registry: readonly LegalSourceEntry[];
  readonly now: number;
  readonly cadence: (c: ExpectedCadence) => number;
  readonly legacyMaxAge: number;
  readonly snapshotMaxAge: number;
}

function resolveDeps(deps: VerifierDeps = {}): Resolved {
  const registry = deps.registry ?? LEGAL_SOURCE_REGISTRY;
  const now = (deps.now ?? (() => Date.now()))();
  return {
    registry,
    now,
    cadence: (c) => deps.cadenceMaxAgeMs?.[c] ?? CADENCE_MAX_AGE_MS[c],
    legacyMaxAge: deps.legacyIndexMaxAgeMs ?? LEGACY_INDEX_MAX_AGE_MS,
    snapshotMaxAge: deps.snapshotMaxAgeMs ?? SNAPSHOT_MAX_AGE_MS,
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Валидна дата, не в бъдещето, не по-стара от `maxAgeMs`. */
function isRecent(value: unknown, now: number, maxAgeMs: number): boolean {
  const raw = str(value);
  if (!raw) return false;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return false;
  if (parsed > now + 60_000) return false;
  return now - parsed <= maxAgeMs;
}

/** URL на точния одобрен origin и разрешен път. */
export function isApprovedUrl(url: unknown, entry: LegalSourceEntry): boolean {
  const raw = str(url);
  if (!raw || !HTTPS_RE.test(raw)) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.origin !== entry.origin) return false;
  return entry.allowedPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix));
}

/** code-owned запис, годен за „действащо право“. */
export function usableRegistryEntries(
  deps: VerifierDeps = {},
): readonly LegalSourceEntry[] {
  const { registry } = resolveDeps(deps);
  return registry.filter(
    (e) => e.enabled && e.reviewStatus === "approved" && e.watchOnly === false,
  );
}

export interface VerifiedSource {
  readonly entry: LegalSourceEntry;
  readonly sourceKey: string;
}

export type SourceVerification =
  | { readonly ok: true; readonly source: VerifiedSource }
  | { readonly ok: false; readonly reason: VerificationReason };

function fail(reason: VerificationReason): SourceVerification {
  return { ok: false, reason };
}

/** Стъпки 1–4: регистър, ingestion, snapshot. */
export async function verifyRegisteredSource(
  db: StrictLegalDb,
  sourceKey: string,
  deps: VerifierDeps = {},
): Promise<SourceVerification> {
  const d = resolveDeps(deps);
  const entry = d.registry.find((e) => e.sourceKey === sourceKey) ?? null;
  if (!entry) return fail("registry_entry_missing");
  if (!entry.enabled || entry.reviewStatus !== "approved" || entry.watchOnly) {
    return fail("registry_entry_disabled");
  }

  try {
    const registryRow = await db
      .from("legal_source_registry")
      .select(
        "source_key, origin, jurisdiction, parser_version, enabled, watch_only, review_status, freshness_state, last_success_at, expected_cadence",
      )
      .eq("source_key", sourceKey)
      .maybeSingle();
    if (registryRow.error) return fail("db_error");
    const row = registryRow.data as Record<string, unknown> | null;
    if (!row) return fail("registry_row_missing");

    if (
      row.source_key !== entry.sourceKey ||
      row.origin !== entry.origin ||
      row.jurisdiction !== entry.jurisdiction ||
      row.parser_version !== entry.parserVersion
    ) {
      return fail("registry_row_mismatch");
    }
    if (row.enabled !== true || row.watch_only !== false || row.review_status !== "approved") {
      return fail("registry_row_disabled");
    }
    if (row.freshness_state !== "fresh") return fail("registry_row_stale");
    if (!isRecent(row.last_success_at, d.now, d.cadence(entry.expectedCadence))) {
      return fail("registry_row_stale");
    }

    // Последното изпълнение е меродавно: по-нов провал не се подминава.
    const runs = await db
      .from("legal_ingestion_runs")
      .select("source_key, outcome, finished_at, started_at")
      .eq("source_key", sourceKey)
      .order("started_at", { ascending: false })
      .limit(1);
    if (runs.error) return fail("db_error");
    const runRows = Array.isArray(runs.data) ? (runs.data as Array<Record<string, unknown>>) : [];
    const latest = runRows[0];
    if (!latest) return fail("ingestion_run_missing");
    if (!str(latest.finished_at)) return fail("ingestion_run_not_accepted");
    if (!ACCEPTED_RUN_OUTCOMES.includes(String(latest.outcome))) {
      return fail("ingestion_run_not_accepted");
    }

    const snapshots = await db
      .from("legal_source_snapshots")
      .select("source_key, canonical_url, parser_version, retrieved_at")
      .eq("source_key", sourceKey)
      .order("retrieved_at", { ascending: false })
      .limit(1);
    if (snapshots.error) return fail("db_error");
    const snapRows = Array.isArray(snapshots.data)
      ? (snapshots.data as Array<Record<string, unknown>>)
      : [];
    const snapshot = snapRows[0];
    if (!snapshot) return fail("snapshot_missing");
    if (!isRecent(snapshot.retrieved_at, d.now, d.snapshotMaxAge)) return fail("snapshot_missing");
    if (snapshot.parser_version !== entry.parserVersion) return fail("snapshot_untrusted");
    if (!isApprovedUrl(snapshot.canonical_url, entry)) return fail("snapshot_untrusted");

    return { ok: true, source: Object.freeze({ entry, sourceKey }) };
  } catch {
    return fail("db_error");
  }
}

export interface VerifiedLegalChunk {
  readonly chunk_id: string;
  readonly document_id: string;
  readonly source_id: string;
  readonly source_key: string;
  readonly citation_label: string;
  readonly content: string;
  readonly article_no: string | null;
  readonly paragraph_no: string | null;
  readonly jurisdiction: "BG" | "EU";
  readonly short_code: string;
  readonly title: string;
  readonly canonical_url: string;
  readonly version: string;
}

export type ChunkVerification =
  | { readonly ok: true; readonly chunk: VerifiedLegalChunk }
  | { readonly ok: false; readonly reason: VerificationReason };

/** Стъпки 5–7 плюс 1–4: пълна верига за един чънк. Всичко е сървърен факт. */
export async function verifyLegalChunk(
  db: StrictLegalDb,
  chunkId: string,
  deps: VerifierDeps = {},
): Promise<ChunkVerification> {
  const d = resolveDeps(deps);
  if (!str(chunkId)) return { ok: false, reason: "chunk_invalid" };

  try {
    const chunkRes = await db
      .from("legal_chunks")
      .select("id, source_id, document_id, citation_label, content, article_no, paragraph_no")
      .eq("id", chunkId)
      .maybeSingle();
    if (chunkRes.error) return { ok: false, reason: "db_error" };
    const chunk = chunkRes.data as Record<string, unknown> | null;
    if (!chunk) return { ok: false, reason: "chunk_invalid" };
    const label = str(chunk.citation_label);
    const content = str(chunk.content);
    const documentId = str(chunk.document_id);
    const sourceId = str(chunk.source_id);
    if (!label || !content || !documentId || !sourceId) {
      return { ok: false, reason: "chunk_invalid" };
    }

    const docRes = await db
      .from("legal_documents")
      .select("id, source_id, version, effective_from, effective_to")
      .eq("id", documentId)
      .maybeSingle();
    if (docRes.error) return { ok: false, reason: "db_error" };
    const doc = docRes.data as Record<string, unknown> | null;
    if (!doc || doc.source_id !== sourceId) return { ok: false, reason: "document_invalid" };
    const version = str(doc.version);
    if (!version) return { ok: false, reason: "document_invalid" };
    if (!isInForce(doc.effective_from, doc.effective_to, d.now)) {
      return { ok: false, reason: "document_not_in_force" };
    }

    const srcRes = await db
      .from("legal_sources")
      .select(
        "id, active, official_url, current_version, last_indexed_at, short_code, title, jurisdiction",
      )
      .eq("id", sourceId)
      .maybeSingle();
    if (srcRes.error) return { ok: false, reason: "db_error" };
    const src = srcRes.data as Record<string, unknown> | null;
    if (!src) return { ok: false, reason: "legacy_source_missing" };
    if (src.active !== true) return { ok: false, reason: "legacy_source_untrusted" };
    const officialUrl = str(src.official_url);
    const currentVersion = str(src.current_version);
    if (!officialUrl || !currentVersion) return { ok: false, reason: "legacy_source_untrusted" };
    if (currentVersion !== version) return { ok: false, reason: "document_invalid" };
    if (!isRecent(src.last_indexed_at, d.now, d.legacyMaxAge)) {
      return { ok: false, reason: "legacy_source_stale" };
    }

    // Origin-ът решава кой официален източник е това. Lex.bg не съвпада с
    // нито един одобрен origin и затова се отказва тук.
    const entry = d.registry.find((e) => isApprovedUrl(officialUrl, e)) ?? null;
    if (!entry) return { ok: false, reason: "legacy_source_untrusted" };

    const verified = await verifyRegisteredSource(db, entry.sourceKey, deps);
    if (!verified.ok) return { ok: false, reason: verified.reason };

    return {
      ok: true,
      chunk: Object.freeze({
        chunk_id: String(chunk.id ?? chunkId),
        document_id: documentId,
        source_id: sourceId,
        source_key: entry.sourceKey,
        citation_label: label.trim(),
        content: content.trim(),
        article_no: str(chunk.article_no),
        paragraph_no: str(chunk.paragraph_no),
        jurisdiction: entry.jurisdiction,
        short_code: str(src.short_code) ?? "",
        title: str(src.title) ?? entry.title,
        canonical_url: officialUrl,
        version,
      }),
    };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}

/** Явна, тестваема проверка за действие на документа. */
export function isInForce(from: unknown, to: unknown, now: number): boolean {
  const fromRaw = str(from);
  if (!fromRaw) return false;
  const parsedFrom = Date.parse(fromRaw);
  if (!Number.isFinite(parsedFrom) || parsedFrom > now) return false;
  if (to === null || to === undefined) return true;
  const toRaw = str(to);
  if (!toRaw) return false;
  const parsedTo = Date.parse(toRaw);
  if (!Number.isFinite(parsedTo) || parsedTo <= now) return false;
  return true;
}

/**
 * ЛЕКА проверка на „контролния слой“ (преди embedding).
 *
 * Отговаря само на въпроса: има ли ПОНЕ ЕДИН одобрен официален източник с
 * доверен регистърен ред, приет последен ingestion и скорошен snapshot. НЕ
 * обхожда корпуса и НЕ проверява чънкове — това е задача на извличането, което
 * проверява само реално относимите кандидати за конкретната заявка.
 *
 * Използва се на всяка AI заявка, за да няма embedding при неготов контрол.
 */
export async function isLegalControlPlaneReady(
  db: StrictLegalDb,
  deps: VerifierDeps = {},
): Promise<boolean> {
  const usable = usableRegistryEntries(deps);
  // Нито един одобрен официален източник → нула заявки към базата.
  if (usable.length === 0) return false;
  for (const entry of usable) {
    const verified = await verifyRegisteredSource(db, entry.sourceKey, deps);
    if (verified.ok) return true;
  }
  return false;
}

/**
 * Готовността е БУЛЕВА и строга: активен легаси ред НИКОГА не е достатъчен.
 * Изисква поне една напълно проверена верига източник → документ → чънк.
 *
 * Обхватът е ПЪЛЕН: обхожда се страница по страница до изчерпване, защото
 * произволен таван прави валидна верига след него невидима. Използва се за
 * проверки на здравето/продукта, НЕ на всяка AI заявка.
 */
/** Размери на страниците при обхождане (пагинация, не таван на верността). */
export const READINESS_PAGE_SIZE = 200;
export const READINESS_CHUNK_PAGE_SIZE = 200;
/** Твърда защита срещу безкраен цикъл при неизправна пагинация. */
const MAX_PAGES_GUARD = 100_000;

/** Детерминирано обхождане на всички страници на една заявка. */
async function forEachPage(
  build: (from: number, to: number) => Promise<StrictResult>,
  pageSize: number,
  visit: (row: Record<string, unknown>) => Promise<boolean>,
): Promise<boolean> {
  for (let page = 0; page < MAX_PAGES_GUARD; page++) {
    const from = page * pageSize;
    const res = await build(from, from + pageSize - 1);
    if (res.error || !Array.isArray(res.data)) return false;
    const rows = res.data as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (await visit(row)) return true;
    }
    if (rows.length < pageSize) return false;
  }
  return false;
}


export async function isStrictLegalKnowledgeBaseReady(
  db: StrictLegalDb,
  deps: VerifierDeps = {},
): Promise<boolean> {
  const usable = usableRegistryEntries(deps);
  // Нито един одобрен официален източник → нула заявки към базата.
  if (usable.length === 0) return false;

  const d = resolveDeps(deps);
  try {
    // Всички активни легаси източници — до изчерпване на страниците.
    return await forEachPage(
      (from, to) =>
        db
          .from("legal_sources")
          .select(
            "id, active, official_url, current_version, last_indexed_at, short_code, title, jurisdiction",
          )
          .eq("active", true)
          .order("id", { ascending: true })
          .range(from, to),
      READINESS_PAGE_SIZE,
      async (row) => {
        const officialUrl = str(row.official_url);
        const currentVersion = str(row.current_version);
        if (!officialUrl || !currentVersion) return false;
        const entry = usable.find((e) => isApprovedUrl(officialUrl, e));
        if (!entry) return false;

        // САМО документи с версия, равна на current_version, и в сила сега —
        // но БЕЗ таван: всички такива документи, страница по страница.
        return await forEachPage(
          (from, to) =>
            db
              .from("legal_documents")
              .select("id, source_id, version, effective_from, effective_to")
              .eq("source_id", row.id)
              .eq("version", currentVersion)
              .order("id", { ascending: true })
              .range(from, to),
          READINESS_PAGE_SIZE,
          async (doc) => {
            const documentId = str(doc.id);
            if (!documentId) return false;
            if (doc.source_id !== row.id) return false;
            if (!isInForce(doc.effective_from, doc.effective_to, d.now)) return false;

            // Всички чънкове на точно този документ: невалиден по-ранен чънк
            // не скрива валиден по-късен, независимо колко са.
            return await forEachPage(
              (from, to) =>
                db
                  .from("legal_chunks")
                  .select("id")
                  .eq("document_id", documentId)
                  .order("id", { ascending: true })
                  .range(from, to),
              READINESS_CHUNK_PAGE_SIZE,
              async (chunk) => {
                const chunkId = str(chunk.id);
                if (!chunkId) return false;
                const verified = await verifyLegalChunk(db, chunkId, deps);
                return verified.ok;
              },
            );
          },
        );
      },
    );
  } catch {
    return false;
  }
}
