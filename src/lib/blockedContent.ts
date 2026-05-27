// Shared helper: detect & surface the `blocked_illegal_content` response
// returned by edge functions when input matches the illegal-content guard.
// Returns true when the error was handled (toast shown), so callers can
// short-circuit their generic error path.

import { toast } from "sonner";

const STRICT_TITLE = "🚫 Заявката е блокирана";

export async function handleBlockedIllegalContent(error: unknown): Promise<boolean> {
  try {
    const ctx = (error as { context?: Response } | null | undefined)?.context;
    if (!ctx || typeof (ctx as Response).clone !== "function") return false;
    const cloned = (ctx as Response).clone();
    const body = await cloned.json().catch(() => null);
    if (!body || body.code !== "blocked_illegal_content") return false;
    toast.error(STRICT_TITLE, {
      description: body.error ?? "Платформата не генерира документи с незаконно съдържание. Опитът е регистриран.",
      duration: 12000,
    });
    return true;
  } catch {
    return false;
  }
}
