/**
 * Повикване към модела за преговорната стратегия: 1 основен + най-много 1
 * резервен модел. НИКОГА трето повикване. Всяко изключение се предава нагоре,
 * за да бъде обработено като изравняване (без връщане на квота, без нов модел).
 */

export const PRIMARY_MODEL = "openai/gpt-5";
export const FALLBACK_MODEL = "google/gemini-2.5-pro";

export interface StrategyModelDeps {
  /** Отчита ЕДНО повикване от твърдия бюджет. Хвърля при изчерпване. */
  take: () => void;
  call: (model: string) => Promise<Response>;
}

export interface StrategyModelResult {
  resp: Response;
  model: string;
  calls: number;
}

/**
 * Резервният модел се опитва САМО при 429/5xx от основния. Изключение от
 * основното повикване НЕ води до резервен опит — операцията е несигурна.
 */
export async function callStrategyModelWithFallback(
  deps: StrategyModelDeps,
): Promise<StrategyModelResult> {
  let calls = 0;
  deps.take();
  calls++;
  const primary = await deps.call(PRIMARY_MODEL);
  if (primary.ok || !(primary.status === 429 || primary.status >= 500)) {
    return { resp: primary, model: PRIMARY_MODEL, calls };
  }
  deps.take();
  calls++;
  const fallback = await deps.call(FALLBACK_MODEL);
  return { resp: fallback, model: FALLBACK_MODEL, calls };
}
