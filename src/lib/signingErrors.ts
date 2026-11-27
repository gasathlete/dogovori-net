/** Shared mapping of create-signing-request failures to plain Bulgarian text. */
export const DAILY_INVITE_LIMIT_MESSAGE = "Достигнахте дневния лимит за покани за подпис. Опитайте отново утре.";
const GENERIC = "Не успяхме да създадем заявката за подпис. Опитайте отново.";

type ErrorLike = { message?: string; context?: unknown } | null | undefined;

/** Reads the function's JSON body from a non-2xx FunctionsHttpError, if any. */
async function bodyOf(error: ErrorLike): Promise<{ error?: string; message?: string } | null> {
  const ctx = error?.context as { clone?: () => Response; json?: () => Promise<unknown> } | undefined;
  if (!ctx || typeof ctx.json !== "function") return null;
  try {
    const res = typeof ctx.clone === "function" ? ctx.clone() : (ctx as Response);
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as { error?: string; message?: string }) : null;
  } catch { return null; }
}

export async function signingFailure(data: unknown, error: ErrorLike): Promise<{ code: string; message: string }> {
  const direct = (data && typeof data === "object" ? data : null) as { error?: string; message?: string } | null;
  const body = direct?.error ? direct : await bodyOf(error);
  const code = body?.error ?? "unknown";
  if (code === "daily_invite_limit") return { code, message: DAILY_INVITE_LIMIT_MESSAGE };
  if (code === "invite_limit_unavailable") return { code, message: "Не успяхме да проверим лимита за покани. Опитайте отново по-късно." };
  return { code, message: GENERIC };
}
