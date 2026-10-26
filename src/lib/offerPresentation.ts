/** Display-only arithmetic; never used to determine checkout prices or rights. */
export function offerSaving(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous <= current) return 0;
  return Math.max(0, Math.round(previous * 100) - Math.round(current * 100)) / 100;
}