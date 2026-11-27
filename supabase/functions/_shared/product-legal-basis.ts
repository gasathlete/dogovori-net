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
import {
  isStrictLegalKnowledgeBaseReady,
  type StrictLegalDb,
  verifyLegalChunk,
  type VerifierDeps,
} from "./legal-verification.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface ProductLegalBasisOptions {
  readonly now?: () => number;
  /** Само за тестове: инжектиране на регистър/часовник в проверяващия модул. */
  readonly verifier?: VerifierDeps;
}

/**
 * Създава порта за ЕДНА заявка. Няма изменяем глобален кеш: всяка заявка чете
 * актуалното състояние на контролния слой.
 */
export function createProductLegalBasisPort(
  db: LegalDbClient,
  options: ProductLegalBasisOptions = {},
): ProductLegalBasisPort {


  return Object.freeze({
    async resolve(candidate: LegalBasis): Promise<ActiveLegalProvision | null> {
      if (!candidate || typeof candidate !== "object") return null;
      const { provision_id, version_id, source_id } = candidate;
      if (!isUuid(provision_id) || !isUuid(version_id) || !isUuid(source_id)) return null;

      // Единственият източник на истина е общият строг проверяващ модул.
      // Етикетът и връзката от модела НЕ участват в решението.
      const verified = await verifyLegalChunk(
        db as unknown as StrictLegalDb,
        provision_id,
        { ...(options.verifier ?? {}), now: options.now },
      );
      if (!verified.ok) return null;
      const chunk = verified.chunk;
      if (chunk.document_id !== version_id) return null;
      if (chunk.source_id !== source_id) return null;

      return Object.freeze({
        provision_id,
        version_id,
        source_id,
        canonical_url: chunk.canonical_url,
        label: chunk.citation_label,
        active: true,
      });
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

/**
 * Готовността е БУЛЕВА и СТРОГА: активен легаси ред сам по себе си никога не е
 * достатъчен. Изисква поне една напълно проверена верига.
 */
export async function isLegalKnowledgeBaseReady(
  db: LegalDbClient,
  deps?: VerifierDeps,
): Promise<boolean> {
  return await isStrictLegalKnowledgeBaseReady(db as unknown as StrictLegalDb, deps);
}
