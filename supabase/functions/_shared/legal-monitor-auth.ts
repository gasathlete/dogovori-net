/**
 * Fail-closed авторизация за legal-source-monitor.
 *
 * Ред на проверките:
 *   1. Точно constant-time съвпадение с SUPABASE_SERVICE_ROLE_KEY → service role,
 *      БЕЗ мрежово auth търсене.
 *   2. Точно 64 малки hex символа → посветеният вътрешен cron ключ, проверен през
 *      public.verify_internal_cron_secret. Успех = същите service семантики.
 *      Грешен ключ или грешка на верификатора → 403 БЕЗ преминаване към user auth.
 *   3. Всеки друг token → admin.auth.getUser(token) и след това is_staff.
 *   4. Всяко отклонение (липсващ token, невалиден потребител, не-staff, грешка
 *      от auth или RPC) отказва достъп. Role claim никога не се декодира.
 *
 * Логиката е чиста и приема минимални зависимости, за да е тестваема.
 */
import { isExactServiceRoleToken } from "./service-token.ts";
import { isDedicatedCronCandidate } from "./cron-auth.ts";

export type MonitorAuth =
  | { ok: true; isServiceRole: boolean; actorId: string | null }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "forbidden" };

export interface MonitorAuthDeps {
  serviceKey: string | null | undefined;
  /** Валидира потребителски (не service) token. */
  getUser: (token: string) => Promise<{ userId: string | null; error?: unknown }>;
  /** public.is_staff(_user_id) */
  isStaff: (userId: string) => Promise<{ staff: boolean; error?: unknown }>;
  /** public.verify_internal_cron_secret(_candidate) */
  verifyDedicated?: (candidate: string) => Promise<boolean>;
}

export async function authorizeMonitorRequest(
  deps: MonitorAuthDeps,
  token: string,
): Promise<MonitorAuth> {
  if (!token) return { ok: false, status: 401, error: "unauthorized" };

  if (isExactServiceRoleToken(token, deps.serviceKey)) {
    return { ok: true, isServiceRole: true, actorId: null };
  }

  if (isDedicatedCronCandidate(token)) {
    if (!deps.verifyDedicated) return { ok: false, status: 403, error: "forbidden" };
    try {
      const ok = await deps.verifyDedicated(token);
      if (ok === true) return { ok: true, isServiceRole: true, actorId: null };
    } catch {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: false, status: 403, error: "forbidden" };
  }


  let actorId: string | null = null;
  try {
    const res = await deps.getUser(token);
    if (res.error) return { ok: false, status: 401, error: "unauthorized" };
    actorId = res.userId ?? null;
  } catch {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!actorId) return { ok: false, status: 401, error: "unauthorized" };

  try {
    const staff = await deps.isStaff(actorId);
    if (staff.error || staff.staff !== true) {
      return { ok: false, status: 403, error: "forbidden" };
    }
  } catch {
    return { ok: false, status: 403, error: "forbidden" };
  }

  return { ok: true, isServiceRole: false, actorId };
}
