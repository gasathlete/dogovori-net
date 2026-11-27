/**
 * ОБВЪРЗВАНЕ НА ГОТОВ ФАЙЛ С ОПЕРАЦИЯ (миграция 0031, НЕприложена).
 *
 * Защо: при загубен отговор клиентът повтаря със СЪЩИЯ ключ. Ако сървърът не
 * може да намери вече качения точен файл, той генерира и таксува наново. Тук
 * артефактът се обвързва с операцията (user + purpose + отпечатък) и се
 * проверява, че обектът наистина съществува, преди да бъде поднесен повторно.
 */

export interface ArtifactBinding {
  readonly operationId: string;
  readonly userId: string;
  readonly bucket: string;
  readonly storagePath: string;
  readonly purpose: string;
  readonly requestDigest: string;
  readonly expiresAt: string;
}

interface ArtifactRpc {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type ArtifactLookup =
  /** Няма обвързан артефакт — нормално първо изпълнение. */
  | { readonly status: "none" }
  /** Обвързан и готов артефакт за ТОЧНО тази заявка. */
  | {
      readonly status: "match";
      readonly bucket: string;
      readonly path: string;
    }
  /** Ключът носи друг потребител/цел/товар — нищо не се поднася. */
  | { readonly status: "mismatch"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

export async function lookupBoundArtifact(
  db: ArtifactRpc,
  input: {
    operationId: string;
    userId: string;
    purpose: string;
    requestDigest: string;
  },
): Promise<ArtifactLookup> {
  const { data, error } = await db.rpc("storage_artifact_lookup", {
    p_operation_id: input.operationId,
  });
  if (error) return { status: "unavailable", reason: "lookup_failed" };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.found !== true) return { status: "none" };
  if (row.ready !== true) return { status: "unavailable", reason: "artifact_not_ready" };
  if (row.user_id !== input.userId) return { status: "mismatch", reason: "user_mismatch" };
  if (row.purpose !== input.purpose) return { status: "mismatch", reason: "purpose_mismatch" };
  if (row.request_digest !== input.requestDigest) {
    return { status: "mismatch", reason: "digest_mismatch" };
  }
  const bucket = typeof row.bucket === "string" ? row.bucket : "";
  const path = typeof row.path === "string" ? row.path : "";
  if (!bucket || !path) return { status: "mismatch", reason: "path_missing" };
  return { status: "match", bucket, path };
}

interface StorageLike {
  from(bucket: string): {
    list(
      prefix: string,
      opts: { search?: string; limit?: number },
    ): Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
  };
}

/**
 * Съществуването на обекта се ДОКАЗВА, не се предполага. „unknown" никога не
 * се третира като наличен файл и никога като липсващ.
 */
export async function verifyArtifactExists(
  storage: StorageLike,
  bucket: string,
  path: string,
): Promise<"present" | "absent" | "unknown"> {
  const slash = path.lastIndexOf("/");
  const prefix = slash > 0 ? path.slice(0, slash) : "";
  const name = slash > 0 ? path.slice(slash + 1) : path;
  try {
    const { data, error } = await storage.from(bucket).list(prefix, { search: name, limit: 100 });
    if (error) return "unknown";
    if (!Array.isArray(data)) return "unknown";
    return data.some((e) => e?.name === name) ? "present" : "absent";
  } catch {
    return "unknown";
  }
}

export type ArtifactBindOutcome =
  | { readonly status: "bound"; readonly replay: boolean }
  | { readonly status: "conflict"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

export async function bindArtifactToOperation(
  db: ArtifactRpc,
  binding: ArtifactBinding,
): Promise<ArtifactBindOutcome> {
  const { data, error } = await db.rpc("storage_artifact_bind", {
    p_operation_id: binding.operationId,
    p_user_id: binding.userId,
    p_bucket: binding.bucket,
    p_storage_path: binding.storagePath,
    p_purpose: binding.purpose,
    p_request_digest: binding.requestDigest,
    p_expires_at: binding.expiresAt,
  });
  if (error) {
    const m = String(error.message ?? "").toLowerCase();
    if (m.includes("artifact_binding_conflict")) {
      return { status: "conflict", reason: "artifact_binding_conflict" };
    }
    return { status: "unavailable", reason: "artifact_bind_failed" };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { status: "unavailable", reason: "artifact_bind_failed" };
  return { status: "bound", replay: row.replay === true };
}
