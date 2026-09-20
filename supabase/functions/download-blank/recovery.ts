/**
 * ЧИСТО РЕШЕНИЕ ЗА ВЪЗСТАНОВЯВАНЕ НА АРТЕФАКТ (без вход/изход).
 *
 * Защо е отделно: „повторение по същия ключ" НИКОГА не бива да стартира второ
 * генериране. Решението кога се поднася вече качен файл, кога операцията е
 * в ход и кога се иска изравняване, е чист контракт и се тества директно.
 */

export type ArtifactExistence = "present" | "absent" | "unknown";

export type RecoveryPlan =
  /** Ключът носи друга заявка — нищо не се поднася и не се таксува. */
  | { readonly action: "conflict" }
  /** Поднася се ТОЧНО обвързаният доказан обект (идемпотентно потвърждение). */
  | { readonly action: "serve_bound"; readonly bucket: string; readonly path: string }
  /** Намерен е детерминираният обект без обвързване — обвързва се и се поднася. */
  | { readonly action: "bind_deterministic" }
  /** Операцията още върви — типизиран повторяем отговор, БЕЗ генериране. */
  | { readonly action: "in_progress" }
  /** Недоказан изход — траен запис и типизирано състояние за изравняване. */
  | { readonly action: "reconcile"; readonly reason: string }
  /** Нормално първо изпълнение: генерира се. */
  | { readonly action: "generate" };

export interface BoundArtifactState {
  readonly status: "none" | "match" | "mismatch" | "unavailable";
  readonly reason?: string;
  readonly bucket?: string;
  readonly path?: string;
}

export interface RecoveryInput {
  readonly bound: BoundArtifactState;
  /** Записаният резултат по ключа (ако има), за проверка срещу обвързването. */
  readonly priorRef?: { bucket?: string | null; path?: string | null } | null;
  /** Повторение на още незавършена операция (доказаната отмяна НЕ е повторение). */
  readonly isReplay: boolean;
}

/** Първи етап: решение спрямо обвързания ред. */
export function planBoundArtifact(input: RecoveryInput): RecoveryPlan | { action: "check_bound" } {
  const { bound, priorRef, isReplay } = input;
  if (bound.status === "mismatch") return { action: "conflict" };
  if (bound.status === "unavailable") {
    return { action: "reconcile", reason: `artifact_${bound.reason ?? "unavailable"}` };
  }
  if (bound.status === "none") {
    // Записан резултат БЕЗ обвързан ред не е доказателство за съществуващ файл.
    return isReplay ? { action: "check_bound" } : { action: "generate" };
  }
  const bucket = bound.bucket ?? "";
  const path = bound.path ?? "";
  if (priorRef?.path) {
    const refBucket = priorRef.bucket ?? bucket;
    if (priorRef.path !== path || refBucket !== bucket) {
      return { action: "reconcile", reason: "result_ref_binding_mismatch" };
    }
  }
  return { action: "check_bound" };
}

/** Втори етап: решение спрямо ДОКАЗАНОТО съществуване на обвързания обект. */
export function planBoundExistence(
  exists: ArtifactExistence,
  bucket: string,
  path: string,
  isReplay: boolean,
): RecoveryPlan {
  if (exists === "present") return { action: "serve_bound", bucket, path };
  if (exists === "unknown") return { action: "reconcile", reason: "bound_artifact_unknown" };
  // Доказано липсващ обект НИКОГА не води до ново генериране върху вече
  // таксувана резервация.
  return isReplay ? { action: "in_progress" } : { action: "reconcile", reason: "bound_artifact_absent" };
}

/**
 * Трети етап: няма обвързан ред, но операцията е повторение. Проверява се
 * ДЕТЕРМИНИРАНИЯТ адрес — там стои файл от опит, спрял преди обвързването.
 */
export function planDeterministicRecovery(
  orphan: ArtifactExistence,
  inProgress: boolean,
): RecoveryPlan {
  if (orphan === "present") return { action: "bind_deterministic" };
  if (orphan === "unknown") return { action: "reconcile", reason: "replay_artifact_unknown" };
  if (inProgress) return { action: "in_progress" };
  return { action: "reconcile", reason: "replay_without_artifact" };
}
