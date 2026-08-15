/**
 * Минимална A/B рамка (client-side, без PII).
 *
 * Вариантът се тегли веднъж на браузър и се пази в localStorage, за да е
 * стабилен между сесии. Всяко funnel събитие носи текущите варианти в props
 * (виж `src/lib/docFunnel.ts`), така че /admin/funnel може да сегментира
 * start_to_fill и clean_review_rate по вариант без допълнителни join-ове.
 */
import { trackFunnelEvent } from "@/lib/funnel";

export type AbVariant = "control" | "variant";

/** Активни тестове. Ключът се използва и като props име (`ab_<id>`). */
export const AB_TESTS = {
  /** CTA „Виж бърз преглед сега" в първите стъпки на wizard-а. */
  quick_preview: { id: "quick_preview", split: 0.5 },
} as const;

export type AbTestId = keyof typeof AB_TESTS;

const STORAGE_KEY = "ab_variants_v1";

type Store = Partial<Record<AbTestId, AbVariant>>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* quota — ignore */ }
}

/** Стабилен вариант за даден тест (тегли се при първо повикване). */
export function getVariant(test: AbTestId): AbVariant {
  const store = readStore();
  const existing = store[test];
  if (existing === "control" || existing === "variant") return existing;
  const assigned: AbVariant = Math.random() < AB_TESTS[test].split ? "variant" : "control";
  writeStore({ ...store, [test]: assigned });
  return assigned;
}

/** Форсиране на вариант през URL (?ab_quick_preview=variant) — за QA/ботове. */
export function applyAbOverridesFromUrl(search: string) {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(search);
    const store = readStore();
    let changed = false;
    for (const test of Object.keys(AB_TESTS) as AbTestId[]) {
      const val = params.get(`ab_${test}`);
      if (val === "control" || val === "variant") {
        store[test] = val;
        changed = true;
      }
    }
    if (changed) writeStore(store);
  } catch { /* ignore */ }
}

/** Всички активни варианти като props за аналитика. */
export function abProps(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const test of Object.keys(AB_TESTS) as AbTestId[]) {
    out[`ab_${test}`] = getVariant(test);
  }
  return out;
}

/** Отчита, че потребителят реално е видял мястото на теста. */
export function trackAbExposure(test: AbTestId, extra?: Record<string, unknown>) {
  trackFunnelEvent("ab_exposure", {
    ab_test: test,
    ab_variant: getVariant(test),
    ...abProps(),
    ...(extra ?? {}),
  });
}

