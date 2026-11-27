/**
 * Едно място за ограничената сървърна грешка „правната проверка е недостъпна“.
 *
 * Поведение при нея е ВЪЗСТАНОВИМО: нищо въведено не се губи, няма
 * пренасочване, няма изход от профила, няма съобщение, което да намеква за
 * загубени данни. Само ясно обяснение и действие „Опитайте отново“.
 */
import { toast } from "sonner";
import {
  isLegalVerificationUnavailable,
  LEGAL_VERIFICATION_UNAVAILABLE,
  generationErrorMessage,
} from "@/lib/generationErrors";

export { LEGAL_VERIFICATION_UNAVAILABLE, isLegalVerificationUnavailable };

export const LEGAL_GATE_MESSAGE = generationErrorMessage("legal_verification_unavailable");

/** Приемливи граници за подсказката „Опитайте след …“. */
export const RETRY_AFTER_MIN_SECONDS = 1;
export const RETRY_AFTER_MAX_SECONDS = 3600;

export interface LegalGateOutcome {
  error?: unknown;
  data?: unknown;
}

function rawRetryAfter(outcome: LegalGateOutcome): unknown {
  const fromData = (outcome.data as { retry_after_seconds?: unknown } | null | undefined)
    ?.retry_after_seconds;
  if (fromData !== undefined) return fromData;
  const err = outcome.error as
    | { retry_after_seconds?: unknown; context?: { retry_after_seconds?: unknown } }
    | null
    | undefined;
  if (err?.retry_after_seconds !== undefined) return err.retry_after_seconds;
  return err?.context?.retry_after_seconds;
}

/**
 * Безопасно четене на интервала: само цели числа в допустимите граници.
 * Всичко друго (текст, NaN, отрицателно, извън диапазона) се игнорира.
 */
export function parseRetryAfterSeconds(outcome: LegalGateOutcome): number | null {
  const raw = rawRetryAfter(outcome);
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const value = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value < RETRY_AFTER_MIN_SECONDS || value > RETRY_AFTER_MAX_SECONDS) return null;
  return value;
}

/** Човешка подсказка на български: „Опитайте след около 15 минути.“ */
export function retryAfterHint(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 90) return `Опитайте след около ${seconds} секунди.`;
  const minutes = Math.round(seconds / 60);
  return `Опитайте след около ${minutes} минути.`;
}

/**
 * Показва съобщението и връща true, ако това е правната преграда. Викащият
 * просто прекъсва обработката — състоянието на екрана остава непокътнато.
 *
 * Няма автоматично повтаряне: „Опитайте отново“ се задейства само от човек.
 */
export function handleLegalVerificationUnavailable(
  outcome: LegalGateOutcome,
  onRetry?: () => void,
): boolean {
  const matched = isLegalVerificationUnavailable({
    error: outcome.error as never,
    data: outcome.data as never,
  });
  if (!matched) return false;
  const hint = retryAfterHint(parseRetryAfterSeconds(outcome));
  toast.info(LEGAL_GATE_MESSAGE, {
    duration: 9000,
    description: hint || undefined,
    action: onRetry ? { label: "Опитайте отново", onClick: onRetry } : undefined,
  });
  return true;
}
