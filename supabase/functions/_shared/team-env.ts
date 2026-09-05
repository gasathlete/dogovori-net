/**
 * Team payment-environment хигиена.
 *
 * Екипът е обвързан с точно едно Stripe окръжение (`sandbox` или `live`).
 * Заявка, която иска действие в различно окръжение от съхраненото, трябва да
 * бъде отказана ПРЕДИ да се създаде Stripe клиент или да се пипне DB.
 */

import type { RpcClient } from "./sandbox-guard.ts";

export const TEAM_ENV_MISMATCH_CODE = "team_environment_mismatch";

export class TeamEnvironmentMismatchError extends Error {
  readonly code = TEAM_ENV_MISMATCH_CODE;
  constructor() {
    // Ограничено съобщение — без изтичане на съхраненото окръжение.
    super(TEAM_ENV_MISMATCH_CODE);
    this.name = "TeamEnvironmentMismatchError";
  }
}

/** Хвърля, когато съхраненото окръжение на екипа не съвпада с поисканото. */
export function assertTeamEnvironment(
  storedEnvironment: unknown,
  requestedEnvironment: unknown,
): void {
  if (
    typeof storedEnvironment !== "string" ||
    storedEnvironment.length === 0 ||
    storedEnvironment !== requestedEnvironment
  ) {
    throw new TeamEnvironmentMismatchError();
  }
}

/** Fail-closed team admin проверка: RPC грешка също е отказ. */
export async function requireTeamAdmin(
  client: RpcClient,
  userId: string,
  teamId: string,
): Promise<void> {
  const { data, error } = await client.rpc("is_team_admin", {
    _user_id: userId,
    _team_id: teamId,
  });
  if (error) {
    console.error("is_team_admin RPC failed — fail-closed:", (error as { message?: string })?.message ?? error);
    throw new Error("Not allowed");
  }
  if (data !== true) throw new Error("Not allowed");
}

export function teamEnvMismatchResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: TEAM_ENV_MISMATCH_CODE, code: TEAM_ENV_MISMATCH_CODE }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
