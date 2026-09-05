/**
 * Payment-environment hardening.
 *
 * Preview/test (sandbox) и live плащанията пишат в ЕДНИ И СЪЩИ таблици
 * (`subscriptions`, `download_quota`, `teams`, `topup_purchases`, …). Затова
 * обикновен автентикиран потребител НЕ трябва да може да поиска sandbox
 * checkout, да плати с тестова карта и да получи реален план/баланс.
 *
 * Правило: `live` е разрешен за всеки автентикиран потребител; `sandbox` е
 * разрешен САМО когато server-side `public.is_staff(_user_id)` върне точно
 * `true`. Всичко друго (false, null, RPC грешка, липсващ userId) е отказ
 * fail-closed с ограничения код `sandbox_forbidden`.
 *
 * Логиката е чиста и приема минимален RPC-клиент, за да е покрита с
 * детерминистични тестове.
 */

export const SANDBOX_FORBIDDEN_CODE = "sandbox_forbidden";

export class SandboxForbiddenError extends Error {
  readonly code = SANDBOX_FORBIDDEN_CODE;
  constructor(message = SANDBOX_FORBIDDEN_CODE) {
    super(message);
    this.name = "SandboxForbiddenError";
  }
}

// Достатъчно широко, за да приема и SupabaseClient (чиито rpc е типизиран по
// схема), и тестов двойник.
// deno-lint-ignore no-explicit-any
export type RpcClient = { rpc: (...args: any[]) => PromiseLike<{ data: any; error: any }> };

/**
 * Проверява дали потребителят е staff (admin/moderator) през
 * `public.is_staff`. Fail-closed: всяко отклонение от `data === true`
 * (включително RPC грешка или различен тип) връща false.
 */
export async function isStaffUser(
  client: RpcClient,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId || typeof userId !== "string") return false;
  try {
    const { data, error } = await client.rpc("is_staff", { _user_id: userId });
    if (error) {
      console.error("is_staff RPC failed — fail-closed:", (error as { message?: string })?.message ?? error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("is_staff RPC threw — fail-closed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Пропуска `live` за всички; за `sandbox` изисква staff. Хвърля
 * `SandboxForbiddenError` при отказ.
 */
export async function assertEnvironmentAllowed(
  client: RpcClient,
  environment: unknown,
  userId: string | null | undefined,
): Promise<void> {
  if (environment === "live") return;
  if (environment !== "sandbox") throw new Error("Invalid environment");
  if (!(await isStaffUser(client, userId))) {
    console.error("sandbox checkout denied for non-staff user");
    throw new SandboxForbiddenError();
  }
}

/** Единен HTTP отговор при отказ — без чувствителен текст навън. */
export function sandboxForbiddenResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: SANDBOX_FORBIDDEN_CODE, code: SANDBOX_FORBIDDEN_CODE }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Извлича userId от ПОДПИСАН Stripe object (checkout session или
 * subscription). Не се доверява на нищо извън metadata на самия обект.
 */
export function extractEventUserId(eventType: string, object: unknown): string | null {
  const obj = (object ?? {}) as { metadata?: Record<string, unknown> };
  const raw = obj?.metadata?.userId;
  if (typeof raw === "string" && raw.length > 0) return raw;
  // invoice.* и други обекти без metadata.userId: няма как да се докаже
  // собственик → в sandbox се третира като непознат (ignored).
  void eventType;
  return null;
}
