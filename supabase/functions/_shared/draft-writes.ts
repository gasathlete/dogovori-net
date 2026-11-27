// Атомарни записи по анонимните чернови (activation continuity).
//
// Защо отделен модул: решението „кой може да пише“ (`draft-auth.ts`) се взема
// след SELECT, а между SELECT и UPDATE състоянието може да се промени (друга
// заявка присвоява черновата, токенът се ротира, редът изтича). Затова самият
// UPDATE носи предикатите на решението — иначе застоял анонимен запис може да
// прегази вече присвоен ред.
//
// Функциите тук са чисти (построяване на предикати) или работят срещу минимален
// интерфейс към базата, така че надпреварите се тестват изолирано, без мрежа.
import type { DraftAuthRow, DraftErrorReason } from "./draft-auth.ts";

export type FilterOp = "eq" | "is" | "gt";
export type Filter = [FilterOp, string, unknown];

/* --------------------------- Предикати на записа -------------------------- */

/**
 * Анонимен запис: същият ред, ВСЕ ОЩЕ непотърсен, ВСЕ ОЩЕ с този токен хеш и
 * ВСЕ ОЩЕ неизтекъл.
 */
export function anonymousWriteFilters(id: string, tokenHash: string, nowIso: string): Filter[] {
  return [
    ["eq", "id", id],
    ["is", "claimed_by", null],
    ["eq", "token_hash", tokenHash],
    ["gt", "expires_at", nowIso],
  ];
}

/** Запис от собственика: същият ред, присвоен точно на него, неизтекъл. */
export function ownerWriteFilters(id: string, userId: string, nowIso: string): Filter[] {
  return [
    ["eq", "id", id],
    ["eq", "claimed_by", userId],
    ["gt", "expires_at", nowIso],
  ];
}

/** Присвояване: непотърсен ред с верния токен, който още не е изтекъл. */
export function claimFilters(id: string, tokenHash: string, nowIso: string): Filter[] {
  return anonymousWriteFilters(id, tokenHash, nowIso);
}

/** Идемпотентно доизчистване след прехвърляне — само за същия собственик. */
export function ownerPurgeFilters(id: string, userId: string): Filter[] {
  return [
    ["eq", "id", id],
    ["eq", "claimed_by", userId],
  ];
}

/* ------------------------- Минимален интерфейс към DB --------------------- */

export interface QueryLike {
  eq(column: string, value: unknown): QueryLike;
  is(column: string, value: unknown): QueryLike;
  gt(column: string, value: unknown): QueryLike;
  select(columns: string): QueryLike;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
}

export interface TableLike {
  update(values: Record<string, unknown>): QueryLike;
  insert(values: Record<string, unknown>): QueryLike;
  select(columns: string): QueryLike;
}

export interface DbLike {
  from(table: string): TableLike;
}

function applyFilters(q: QueryLike, filters: Filter[]): QueryLike {
  let out = q;
  for (const [op, col, val] of filters) out = out[op](col, val);
  return out;
}

/** UPDATE с предикати; връща реда САМО ако наистина е обновен точно един ред. */
export async function updateGuarded(
  db: DbLike,
  table: string,
  values: Record<string, unknown>,
  filters: Filter[],
): Promise<{ row: { id: string } | null; error: unknown }> {
  const q = applyFilters(db.from(table).update(values), filters).select("id");
  const { data, error } = await q.maybeSingle();
  return { row: (data as { id: string } | null) ?? null, error: error ?? null };
}

/* --------------------- Причина при загубена надпревара -------------------- */

function isExpiredRow(row: DraftAuthRow, now: number): boolean {
  const t = Date.parse(row.expires_at);
  return !Number.isFinite(t) || t <= now;
}

/**
 * Нула обновени реда при разрешен запис = състоянието се е сменило между
 * четенето и записа. Класифицираме по текущия ред — без повторен опит и без
 * създаване на дубликат.
 */
export function classifyLostWrite(
  row: DraftAuthRow | null,
  ctx: { userId: string | null; tokenHash: string | null; now: number },
): DraftErrorReason {
  if (!row) return "expired";
  if (isExpiredRow(row, ctx.now)) return "expired";
  if (row.claimed_by) {
    if (!ctx.userId) return "unauthorized";
    if (ctx.userId !== row.claimed_by) return "different_owner";
    // Присвоена на същия потребител, но анонимният запис е бил заявен с токен →
    // междувременно е присвоена; клиентът трябва да продължи като собственик.
    return "already_claimed";
  }
  if (!ctx.tokenHash || row.token_hash !== ctx.tokenHash) return "invalid_token";
  return "network";
}

export type LostClaim =
  | { ok: true; idempotent: true }
  | { ok: false; reason: DraftErrorReason };

/**
 * Нула обновени реда при присвояване. Същият собственик стига до същия
 * резултат (идемпотентно), чужд се отказва, изтекъл остава изтекъл.
 */
export function classifyLostClaim(
  row: DraftAuthRow | null,
  ctx: { userId: string; now: number },
): LostClaim {
  if (!row) return { ok: false, reason: "expired" };
  if (isExpiredRow(row, ctx.now)) return { ok: false, reason: "expired" };
  if (row.claimed_by === ctx.userId) return { ok: true, idempotent: true };
  if (row.claimed_by) return { ok: false, reason: "already_claimed" };
  return { ok: false, reason: "invalid_token" };
}

/* ----------------- Детерминистично прехвърляне на резултата --------------- */

/**
 * Идентификаторът на записания документ е самият (сървърно генериран) UUID на
 * черновата → повторно присвояване стига до същия документ, а не до дубликат.
 */
export function deterministicSavedDocId(draftId: string): string {
  return draftId;
}

export function savedDocSourceId(draftId: string): string {
  return `anonymous_draft:${draftId}`;
}

/** Postgres unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
}

export type EnsureSavedResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; reason: DraftErrorReason };

/**
 * Вкарва документа веднъж, с детерминистичен идентификатор. При сблъсък приема
 * съществуващия ред САМО ако е на същия потребител — иначе се отказва безопасно.
 */
export async function ensureSavedDocument(
  db: DbLike,
  input: { draftId: string; userId: string; title: string; payload: Record<string, unknown> },
): Promise<EnsureSavedResult> {
  const id = deterministicSavedDocId(input.draftId);
  const { data, error } = await db
    .from("saved_documents")
    .insert({
      id,
      user_id: input.userId,
      kind: "contract",
      title: input.title.slice(0, 200),
      payload: input.payload,
      source_id: savedDocSourceId(input.draftId),
    })
    .select("id")
    .maybeSingle();

  if (!error && (data as { id?: string } | null)?.id) {
    return { ok: true, id: (data as { id: string }).id, created: true };
  }
  if (error && !isUniqueViolation(error)) return { ok: false, reason: "network" };

  const { data: existing, error: readErr } = await db
    .from("saved_documents")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, reason: "network" };
  const row = existing as { id: string; user_id: string } | null;
  if (!row) return { ok: false, reason: "network" };
  if (row.user_id !== input.userId) return { ok: false, reason: "different_owner" };
  return { ok: true, id: row.id, created: false };
}
