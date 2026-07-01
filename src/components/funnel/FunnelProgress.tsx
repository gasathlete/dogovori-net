import type { FunnelStep } from "@/lib/funnel";

interface Props {
  current: FunnelStep;
  className?: string;
}

/**
 * The visible 1·2·3·4 funnel indicator was removed by product decision — the
 * numbered steps felt too "wizard-like" on mobile. The component is retained
 * as a no-op so existing imports don't break; funnel step tracking still lives
 * in `markFunnelStep()` (see `src/lib/funnel.ts`).
 */
export function FunnelProgress(_props: Props) {
  return null;
}
