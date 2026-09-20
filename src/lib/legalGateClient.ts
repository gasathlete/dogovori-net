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

export interface LegalGateOutcome {
  error?: unknown;
  data?: unknown;
}

/**
 * Показва съобщението и връща true, ако това е правната преграда. Викащият
 * просто прекъсва обработката — състоянието на екрана остава непокътнато.
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
  toast.info(LEGAL_GATE_MESSAGE, {
    duration: 9000,
    action: onRetry ? { label: "Опитайте отново", onClick: onRetry } : undefined,
  });
  return true;
}
