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
