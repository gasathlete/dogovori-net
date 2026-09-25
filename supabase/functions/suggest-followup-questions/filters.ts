// Безопасен избор на въпроси: входните sector_id/contract_type НИКОГА не се
// вграждат в PostgREST филтър. Сравнението е точно равенство в паметта.

export interface BankRow {
  sector_id: string | null;
  contract_type: string | null;
}

export type ParsedScope =
  | { ok: true; sectorId: string | null; contractType: string | null }
  | { ok: false; field: "sector_id" | "contract_type" };

const MAX_LEN = 200;
// Контролни знаци (вкл. нов ред) не са нормални стойности на сектор/вид документ.
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function parseOne(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0) return null;
  if (s.length > MAX_LEN || CONTROL.test(s)) return undefined;
  return s;
}

export function parseScope(body: Record<string, unknown>): ParsedScope {
  const sectorId = parseOne(body.sector_id);
  if (sectorId === undefined) return { ok: false, field: "sector_id" };
  const contractType = parseOne(body.contract_type);
  if (contractType === undefined) return { ok: false, field: "contract_type" };
  return { ok: true, sectorId, contractType };
}

/** Същата семантика като предишния `.or(x.eq.V,x.is.null)`, но без низов филтър. */
export function matchesScope(row: BankRow, sectorId: string | null, contractType: string | null): boolean {
  if (sectorId !== null && row.sector_id !== null && row.sector_id !== sectorId) return false;
  if (contractType !== null && row.contract_type !== null && row.contract_type !== contractType) return false;
  return true;
}

export function parseLimit(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 5;
  return Math.min(10, Math.max(1, n));
}

/** Защитен максимум на един обхват. Надхвърляне → честа грешка, не частичен резултат. */
export const SCOPE_CAPACITY = 500;

export type ScopeFilter = { column: "sector_id" | "contract_type"; value: string | null };

/**
 * Всички комбинации (стойност | NULL) за подадените измерения. Всяка комбинация
 * става отделна заявка с `.eq`/`.is` — никакъв низов филтър.
 */
export function scopeCombos(sectorId: string | null, contractType: string | null): ScopeFilter[][] {
  const dim = (column: ScopeFilter["column"], v: string | null): ScopeFilter[][] =>
    v === null ? [[]] : [[{ column, value: v }], [{ column, value: null }]];
  const out: ScopeFilter[][] = [];
  for (const a of dim("sector_id", sectorId)) for (const b of dim("contract_type", contractType)) out.push([...a, ...b]);
  return out;
}

export interface RankedRow { id: string; importance: number | null }

/** Дедупликация по id и детерминистичен ред: importance ↓, после id ↑. */
export function mergeRanked<T extends RankedRow>(groups: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const g of groups) for (const r of g) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) =>
    (y.importance ?? 0) - (x.importance ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
