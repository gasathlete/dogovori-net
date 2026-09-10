/**
 * Неизменният контекст на една продуктова заявка (роля, цел, отсрещна страна,
 * предпочитана позиция).
 *
 * Модулът е чист и се ползва И от `create-product-checkout`, И от
 * `fulfill-product`, за да няма два различни набора правила. Браузърът НЕ
 * задава класификация, модел или маршрут — само тези кратки полета.
 */
import type { ProductPurchaseId } from "./product-purchase.ts";

export const PRODUCT_CONTEXT_KEYS = Object.freeze([
  "role",
  "objective",
  "counterparty_context",
  "preferred_position",
] as const);

export const PRODUCT_POSITIONS = Object.freeze(["conservative", "balanced", "assertive"] as const);
export type ProductPosition = (typeof PRODUCT_POSITIONS)[number];

export type ProductContextProblem =
  | "invalid_context"
  | "unknown_context_field"
  | "context_too_long"
  | "context_too_short"
  | "invalid_position"
  | "role_required"
  | "objective_required"
  | "counterparty_required"
  | "position_required";

export class ProductContextError extends Error {
  readonly reason: ProductContextProblem;
  constructor(reason: ProductContextProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductContextError";
  }
}

export interface ProductContext {
  readonly role: string;
  readonly objective?: string;
  readonly counterparty_context?: string;
  readonly preferred_position?: ProductPosition;
}

const MAX_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  role: 120,
  objective: 400,
  counterparty_context: 400,
});

/**
 * Проверява и нормализира контекста според изискванията на продукта:
 *  - роля — за всички трите продукта;
 *  - цел и предпочитана позиция — за поправка и премиум пакет;
 *  - контекст за отсрещната страна — за премиум пакета.
 */
export function validateProductContext(raw: unknown, productId: ProductPurchaseId): ProductContext {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProductContextError("invalid_context");
  }
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!(PRODUCT_CONTEXT_KEYS as readonly string[]).includes(key)) {
      throw new ProductContextError("unknown_context_field");
    }
  }
  const out: Record<string, string> = {};
  for (const key of ["role", "objective", "counterparty_context"] as const) {
    const value = src[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LENGTHS[key]) throw new ProductContextError("context_too_long");
    if (trimmed.length < 2) throw new ProductContextError("context_too_short");
    out[key] = trimmed;
  }
  const position = src.preferred_position;
  if (typeof position === "string" && position) {
    if (!(PRODUCT_POSITIONS as readonly string[]).includes(position)) {
      throw new ProductContextError("invalid_position");
    }
    out.preferred_position = position;
  }

  if (!out.role) throw new ProductContextError("role_required");
  if (productId !== "contract_check") {
    if (!out.objective) throw new ProductContextError("objective_required");
    if (!out.preferred_position) throw new ProductContextError("position_required");
  }
  if (productId === "negotiation_package" && !out.counterparty_context) {
    throw new ProductContextError("counterparty_required");
  }
  return out as unknown as ProductContext;
}

/**
 * Приема ВЕЧЕ ЗАПИСАН контекст (от заявката) и се проваля затворено, ако не
 * отговаря на същите правила. Изпълнението не поправя стар контекст.
 */
export function requireStoredProductContext(
  raw: unknown,
  productId: ProductPurchaseId,
): ProductContext {
  return validateProductContext(raw ?? {}, productId);
}

/** Стабилен ред на ключовете — за точно сравнение между заявка и задача. */
export function canonicalContextJson(context: unknown): string {
  if (context === null || typeof context !== "object" || Array.isArray(context)) return "{}";
  const src = context as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of PRODUCT_CONTEXT_KEYS) {
    if (src[key] !== undefined) ordered[key] = src[key];
  }
  return JSON.stringify(ordered);
}

export function sameProductContext(a: unknown, b: unknown): boolean {
  return canonicalContextJson(a) === canonicalContextJson(b);
}
