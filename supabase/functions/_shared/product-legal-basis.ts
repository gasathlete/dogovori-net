/**
 * АКТИВНО правно основание за платените продукти.
 *
 * Правилото е едно: цитат от модела НЕ създава авторитет. Основание съществува
 * само когато точна тройка (разпоредба, версия, източник) е намерена в базата
 * знания, версията е в сила, източникът е активен, каноничната връзка е
 * официална https и етикетът съвпада ТОЧНО със записания.
 *
 * Провалът е затворен: липсващ, оттеглен, заменен, двусмислен запис или грешка
 * в базата → `null`. Няма RAG, няма embedding, няма мрежа.
 */
import type { LegalBasis } from "./product-result-contract.ts";
import type {
  ActiveLegalProvision,
  ProductLegalBasisPort,
} from "./product-generation-runtime.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTPS_RE = /^https:\/\/[^\s"']+$/;

export interface LegalQueryResult {
  readonly data: unknown;
  readonly error: unknown;
}

/** Минималният отпечатък на клиента, който този модул ползва. */
export interface LegalDbClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<LegalQueryResult>;
        limit(count: number): Promise<LegalQueryResult>;
      };
    };
  };
}

interface ChunkRow {
  id?: unknown;
  source_id?: unknown;
  document_id?: unknown;
  citation_label?: unknown;
}

interface DocumentRow {
  id?: unknown;
  source_id?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
}

interface SourceRow {
  id?: unknown;
  active?: unknown;
  official_url?: unknown;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function inForce(row: DocumentRow, now: number): boolean {
  const from = row.effective_from;
  const to = row.effective_to;
  if (typeof from === "string") {
    const parsed = Date.parse(from);
    if (!Number.isFinite(parsed) || parsed > now) return false;
  }
  if (to !== null && to !== undefined) {
    if (typeof to !== "string") return false;
    const parsed = Date.parse(to);
    // Изтекла или неразбираема крайна дата → няма действащо основание.
    if (!Number.isFinite(parsed) || parsed <= now) return false;
  }
  return true;
}

export interface ProductLegalBasisOptions {
  readonly now?: () => number;
}

/**
 * Създава порта за ЕДНА заявка. Няма изменяем глобален кеш: всяка заявка чете
 * актуалното състояние на контролния слой.
 */
export function createProductLegalBasisPort(
  db: LegalDbClient,
  options: ProductLegalBasisOptions = {},
): ProductLegalBasisPort {
  const now = options.now ?? (() => Date.now());

  return Object.freeze({
    async resolve(candidate: LegalBasis): Promise<ActiveLegalProvision | null> {
      if (!candidate || typeof candidate !== "object") return null;
      const { provision_id, version_id, source_id, canonical_url, label } = candidate;
      if (!isUuid(provision_id) || !isUuid(version_id) || !isUuid(source_id)) return null;
      if (typeof label !== "string" || label.trim().length === 0) return null;
      if (typeof canonical_url !== "string" || !HTTPS_RE.test(canonical_url)) return null;

      try {
        const chunk = await db
          .from("legal_chunks")
          .select("id, source_id, document_id, citation_label")
          .eq("id", provision_id)
          .maybeSingle();
        if (chunk.error) return null;
        const chunkRow = chunk.data as ChunkRow | null;
        if (!chunkRow) return null;
        if (chunkRow.source_id !== source_id) return null;
        if (chunkRow.document_id !== version_id) return null;
        if (typeof chunkRow.citation_label !== "string") return null;
        // Етикетът е сървърен факт. Различен етикет от модела е отказ.
        if (chunkRow.citation_label.trim() !== label.trim()) return null;

        const document = await db
          .from("legal_documents")
          .select("id, source_id, effective_from, effective_to")
          .eq("id", version_id)
          .maybeSingle();
        if (document.error) return null;
        const documentRow = document.data as DocumentRow | null;
        if (!documentRow || documentRow.source_id !== source_id) return null;
        if (!inForce(documentRow, now())) return null;

        const source = await db
          .from("legal_sources")
          .select("id, active, official_url")
          .eq("id", source_id)
          .maybeSingle();
        if (source.error) return null;
        const sourceRow = source.data as SourceRow | null;
        if (!sourceRow || sourceRow.active !== true) return null;
        const officialUrl = sourceRow.official_url;
        if (typeof officialUrl !== "string" || !HTTPS_RE.test(officialUrl)) return null;
        // Каноничната връзка е СЪРВЪРНА. Друга връзка не поражда авторитет.
        if (officialUrl !== canonical_url) return null;

        return Object.freeze({
          provision_id,
          version_id,
          source_id,
          canonical_url: officialUrl,
          label: chunkRow.citation_label.trim(),
          active: true,
        });
      } catch {
        return null;
      }
    },
  });
}

export interface ActiveLegalSourceRef {
  readonly source_id: string;
  readonly short_code: string;
  readonly title: string;
}

/**
 * Компактен, сървърен списък с ДОПУСТИМИ активни източници. Ползва се само за
 * ориентир в подсказката; никога не се подава непроверен външен текст.
 */
export async function loadActiveLegalInventory(
  db: LegalDbClient,
  limit = 40,
): Promise<readonly ActiveLegalSourceRef[]> {
  try {
    const result = await db
      .from("legal_sources")
      .select("id, short_code, title, active")
      .eq("active", true)
      .limit(limit);
    if (result.error || !Array.isArray(result.data)) return Object.freeze([]);
    const rows = (result.data as Array<Record<string, unknown>>)
      .filter((row) =>
        isUuid(row.id) && typeof row.short_code === "string" && typeof row.title === "string"
      )
      .map((row) =>
        Object.freeze({
          source_id: row.id as string,
          short_code: row.short_code as string,
          title: row.title as string,
        })
      );
    return Object.freeze(rows);
  } catch {
    return Object.freeze([]);
  }
}

/** Готовността на базата знания е БУЛЕВА: нищо вътрешно не изтича навън. */
export async function isLegalKnowledgeBaseReady(db: LegalDbClient): Promise<boolean> {
  const inventory = await loadActiveLegalInventory(db, 1);
  return inventory.length > 0;
}
