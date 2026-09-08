// Q2e/C — редът на валидация и резервация за DogovaryAI.
//
// Изнесено ТУК, за да е тестваемо без частната зависимост на entrypoint-а:
// handler-ът извиква `runAssistantQuotaGate`, а не собствена копие-логика.
//
// Абсолютно правило: НЕВАЛИДЕН, ЛИПСВАЩ, ЧУЖД, НЕСЪВПАДАЩ или ОСТАРЯЛ контекст
// изразходва НУЛА операции — нито един resevation път не се докосва. Приетите
// пътища (екип / платен / безплатен) резервират ТОЧНО ЕДИН път.

export type ReservationPath = "team" | "pro" | "free";

export interface AssistantGateFailure {
  ok: false;
  status: number;
  code: string;
  error: string;
}

export interface ThreadBinding {
  userId: string;
  contextKind: string | null;
  contextEntityId: string | null;
  contextVersion: string | null;
}

export interface OrchestrationInput {
  userId: string;
  /** `"invalid"` = клиентът е подал нередовен контекст. */
  requestedContext: { kind: string; entityId: string } | null | "invalid";
  /** Съществуващ разговор (или `null` за нов). */
  existingThread: ThreadBinding | null | "not_found";
  /** Резултат от разрешаването през RLS (`null`, когато няма заявен контекст). */
  resolved: { version: string } | null;
  /** Код на отказ от разрешаването, ако има такъв. */
  resolutionFailure: "document_not_found" | "analysis_context_stale" | null;
  plan: { teamId: string | null; isPro: boolean };
}

export type OrchestrationDecision =
  | { ok: true; path: ReservationPath }
  | AssistantGateFailure;

const FAILURES: Record<string, { status: number; error: string }> = {
  invalid_document_context: { status: 400, error: "Невалиден документен контекст." },
  thread_not_found: { status: 404, error: "Разговорът не е намерен" },
  document_context_mismatch: {
    status: 409,
    error: "Разговорът е обвързан с друг документ. Започнете нов разговор.",
  },
  document_not_found: { status: 404, error: "Документът не е намерен." },
  document_context_stale: {
    status: 409,
    error:
      "Документът е променен след започването на този разговор. Започнете нов разговор с текущата версия.",
  },
  analysis_context_stale: {
    status: 409,
    error:
      "Този риск анализ е направен върху друга версия на документа. Направете нов анализ, за да разговаряте по него.",
  },
};

function fail(code: keyof typeof FAILURES | string): AssistantGateFailure {
  const f = FAILURES[code] ?? { status: 400, error: "Заявката не може да бъде изпълнена." };
  return { ok: false, status: f.status, code, error: f.error };
}

/** Чисто решение — без база, без мрежа, без странични ефекти. */
export function decideAssistantOrchestration(input: OrchestrationInput): OrchestrationDecision {
  if (input.requestedContext === "invalid") return fail("invalid_document_context");

  if (input.existingThread === "not_found") return fail("thread_not_found");

  const requestedKind = input.requestedContext?.kind ?? null;
  const requestedId = input.requestedContext?.entityId ?? null;

  if (input.existingThread) {
    if (input.existingThread.userId !== input.userId) return fail("thread_not_found");
    const boundKind = input.existingThread.contextKind ?? null;
    const boundId = input.existingThread.contextEntityId ?? null;
    if (boundKind !== requestedKind || boundId !== requestedId) {
      return fail("document_context_mismatch");
    }
  }

  if (input.requestedContext) {
    if (input.resolutionFailure) return fail(input.resolutionFailure);
    if (!input.resolved) return fail("document_not_found");
    const boundVersion = input.existingThread?.contextVersion ?? null;
    if (boundVersion && boundVersion !== input.resolved.version) {
      return fail("document_context_stale");
    }
  }

  if (input.plan.teamId) return { ok: true, path: "team" };
  if (input.plan.isPro) return { ok: true, path: "pro" };
  return { ok: true, path: "free" };
}

// ---------------------------------------------------------------------------
// Резервация (инжектируема — тества се без база)
// ---------------------------------------------------------------------------

/** Ефективен сървърен безплатен лимит за AI съобщения. Непроменен. */
export const FREE_AI_MESSAGES = 3;

export interface ReservationDeps {
  /** Service-role достъп до `download_quota` (само за безплатния път). */
  admin: { from: (table: string) => any };
  /** JWT клиент за RPC-тата, които вече носят собствен обхват. */
  userClient: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<any> };
  userId: string;
  teamId: string | null;
}

export type ReservationResult = { ok: true } | AssistantGateFailure;

const RESERVATION_FAILURES: Record<string, { status: number; error: string }> = {
  team_limit_reached: { status: 402, error: "Екипната квота е изчерпана за този период." },
  ai_plan_limit_reached: { status: 402, error: "Изчерпани са операциите по плана за този период." },
  ai_free_limit_reached: {
    status: 402,
    error:
      `Изчерпахте ${FREE_AI_MESSAGES}-те безплатни запитвания към DogovaryAI. Активирайте план Професионалист, Предприемач или Екип за неограничен достъп.`,
  },
};

function reservationFail(code: string): AssistantGateFailure {
  const f = RESERVATION_FAILURES[code];
  return { ok: false, status: f.status, code, error: f.error };
}

/**
 * Безплатният път: едно прието съобщение вдига `ai_messages_used`,
 * `monthly_total_used` и `total_used` ТОЧНО по веднъж, атомарно чрез
 * compare-and-update спрямо прочетените стойности (без клиентско консумиране).
 */
async function reserveFree(deps: ReservationDeps): Promise<ReservationResult> {
  const { data: current } = await deps.admin
    .from("download_quota")
    .select("ai_messages_used, monthly_total_used, total_used")
    .eq("user_id", deps.userId)
    .maybeSingle();

  if (!current) {
    await deps.admin
      .from("download_quota")
      .upsert(
        { user_id: deps.userId, ai_messages_used: 0, monthly_total_used: 0, total_used: 0 },
        { onConflict: "user_id" },
      );
  }

  const aiUsed = Number(current?.ai_messages_used ?? 0);
  const monthlyUsed = Number(current?.monthly_total_used ?? 0);
  const totalUsed = Number(current?.total_used ?? 0);

  const { data: reserved, error } = await deps.admin
    .from("download_quota")
    .update({
      ai_messages_used: aiUsed + 1,
      monthly_total_used: monthlyUsed + 1,
      total_used: totalUsed + 1,
    })
    .eq("user_id", deps.userId)
    .eq("ai_messages_used", aiUsed)
    .eq("monthly_total_used", monthlyUsed)
    .eq("total_used", totalUsed)
    .lt("ai_messages_used", FREE_AI_MESSAGES)
    .select("ai_messages_used")
    .maybeSingle();

  if (error || !reserved) return reservationFail("ai_free_limit_reached");
  return { ok: true };
}

export async function reserveAssistantOperation(
  path: ReservationPath,
  deps: ReservationDeps,
): Promise<ReservationResult> {
  if (path === "team") {
    const { data, error } = await deps.userClient.rpc("consume_team_quota", {
      _team_id: deps.teamId,
    });
    const tg = data as { ok?: boolean } | null;
    if (error || !tg || tg.ok === false) return reservationFail("team_limit_reached");
    return { ok: true };
  }
  if (path === "pro") {
    const { data, error } = await deps.userClient.rpc("consume_ai_message");
    const pg = data as { ok?: boolean } | null;
    if (error || !pg || pg.ok === false) return reservationFail("ai_plan_limit_reached");
    return { ok: true };
  }
  return await reserveFree(deps);
}

/**
 * Точката, която handler-ът наистина ползва.
 *
 * Ред (доказан с тестове):
 *   1) ЦЯЛАТА валидация — при отказ НУЛА резервации и НУЛА записи;
 *   2) създаване на разговора и запис на потребителското съобщение — ако някой
 *      от тях се провали, връщаме контролирана грешка БЕЗ да сме таксували и
 *      БЕЗ да викаме AI шлюза;
 *   3) ТОЧНО ЕДНА резервация — последна, за да няма нужда от компенсация.
 */
export interface OrchestrationEffects {
  /** Връща ID на разговора (съществуващ или нов) или `null` при грешка. */
  ensureThread: () => Promise<string | null>;
  /** `true` при успешен запис на последното потребителско съобщение. */
  persistUserMessage: (threadId: string) => Promise<boolean>;
}

export type OrchestrationOutcome =
  | { ok: true; path: ReservationPath; threadId: string }
  | AssistantGateFailure;

export async function runAssistantOrchestration(
  input: OrchestrationInput,
  deps: ReservationDeps,
  effects: OrchestrationEffects,
): Promise<OrchestrationOutcome> {
  const decision = decideAssistantOrchestration(input);
  if (!decision.ok) return decision;

  const threadId = await effects.ensureThread();
  if (!threadId) {
    return {
      ok: false,
      status: 503,
      code: "thread_unavailable",
      error: "Разговорът не може да бъде запазен в момента. Опитайте отново след минута.",
    };
  }

  const persisted = await effects.persistUserMessage(threadId);
  if (!persisted) {
    return {
      ok: false,
      status: 503,
      code: "message_persist_failed",
      error: "Съобщението не може да бъде запазено в момента. Опитайте отново след минута.",
    };
  }

  const reserved = await reserveAssistantOperation(decision.path, deps);
  if (!reserved.ok) return reserved;

  return { ok: true, path: decision.path, threadId };
}
