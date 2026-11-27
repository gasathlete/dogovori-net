/**
 * useFreeJourneyStage — derives a tactical conversion stage from the user's
 * free-op usage. Drives all in-app tease channels (chips, toasts, value cards).
 *
 *   stage 0 — Discovery: opsUsed = 0, no push.
 *   stage 1 — Aha:      opsUsed = 1, soft hint.
 *   stage 2 — Pressure: opsUsed = 2, ROI tease.
 *   stage 3 — Convert:  opsUsed ≥ cap, paywall mode.
 */

import { useMemo } from "react";
import { useIsPro } from "@/hooks/useIsPro";

export type FreeJourneyStage = 0 | 1 | 2 | 3;

export interface FreeJourneyState {
  isPro: boolean;
  loading: boolean;
  stage: FreeJourneyStage;
  opsUsed: number;
  opsCap: number;
  opsLeft: number;
}

export function useFreeJourneyStage(): FreeJourneyState {
  const { isPro, loading, freeQuota } = useIsPro();
  return useMemo<FreeJourneyState>(() => {
    const opsUsed = Math.max(0, freeQuota.opsUsed ?? 0);
    const opsCap = Math.max(1, freeQuota.opsCap ?? 3);
    const opsLeft = Math.max(0, opsCap - opsUsed);
    let stage: FreeJourneyStage = 0;
    if (isPro) stage = 0;
    else if (opsUsed >= opsCap) stage = 3;
    else if (opsUsed >= opsCap - 1) stage = 2;
    else if (opsUsed >= 1) stage = 1;
    return { isPro, loading, stage, opsUsed, opsCap, opsLeft };
  }, [isPro, loading, freeQuota.opsUsed, freeQuota.opsCap]);
}
