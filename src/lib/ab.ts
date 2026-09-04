/**
 * Минимална A/B и rollout рамка (client-side, без PII).
 *
 * Модел: всеки браузър тегли веднъж случаен „seed“ (localStorage). За всеки
 * тест от seed-а, името и версията на теста се извлича стабилен числов bucket
 * 0…9999. Вариантът е `variant`, когато bucket < праг (split × 10000).
 *
 * Защо bucket, а не запомнен вариант: прагът може да се вдига поетапно
 * (10% → 25% → 100%) и при всяко вдигане част от досегашните „control“
 * попадат във „variant“ детерминистично, без да се чисти хранилището и без
 * някой вече във „variant“ да се върне назад. Нова `version` разбърква наново.
 *
 * QA override (`?ab_<test>=variant`) е валиден само в текущия таб
 * (sessionStorage) и не пипа постоянното присвояване.
 *
 * Всяко funnel събитие носи текущите варианти в props (виж
 * `src/lib/docFunnel.ts`), така че /admin/funnel може да сегментира по вариант.
 */
import { trackFunnelEvent } from "@/lib/funnel";

export type AbVariant = "control" | "variant";

export interface AbTestConfig {
  id: string;
  /** Дял на „variant“ (0…1). Вдигането му е безопасно — виж описанието горе. */
  split: number;
  /** Смяната на версията разбърква bucket-ите наново (нов експеримент). */
  version: number;
}

/** Активни тестове. Ключът се използва и като props име (`ab_<id>`). */
export const AB_TESTS = {
  /** CTA „Виж бърз преглед сега" в първите стъпки на wizard-а. */
  quick_preview: { id: "quick_preview", split: 0.5, version: 1 },
  /**
   * Activation continuity: „variant“ = каноничен draft модел (без лични данни
   * в localStorage) + възстановяване след вход. „control“ = старото поведение.
   * Rollout по прага: 0.1 → 0.25 → 0.5 → 1. За QA: ?ab_activation_continuity=variant.
   */
  activation_continuity: { id: "activation_continuity", split: 0.25, version: 1 },
} as const satisfies Record<string, AbTestConfig>;

export type AbTestId = keyof typeof AB_TESTS;

export const AB_BUCKETS = 10000;

const SEED_KEY = "ab_seed_v2";
const LEGACY_VARIANTS_KEY = "ab_variants_v1";
const SESSION_OVERRIDES_KEY = "ab_overrides_session_v1";

type Overrides = Partial<Record<AbTestId, AbVariant>>;

function isVariant(v: unknown): v is AbVariant {
  return v === "control" || v === "variant";
}

/* --------------------------------- Хеш ----------------------------------- */

/** FNV-1a (32-bit) — детерминистичен, бърз, без зависимости. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Bucket 0…9999 за (seed, тест, версия). Чиста функция — тества се изолирано. */
export function bucketFor(seed: string, testId: string, version: number): number {
  return fnv1a(`${seed}|${testId}|v${version}`) % AB_BUCKETS;
}

/** Вариант по bucket и праг. Монотонен по прага: по-висок праг ⇒ повече „variant“. */
export function resolveVariant(bucket: number, split: number): AbVariant {
  const threshold = Math.round(Math.min(1, Math.max(0, split)) * AB_BUCKETS);
  return bucket < threshold ? "variant" : "control";
}

/* --------------------------------- Seed ---------------------------------- */

function randomSeed(): string {
  try {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function readLegacyVariants(): Overrides {
  try {
    const raw = localStorage.getItem(LEGACY_VARIANTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Overrides = {};
    for (const test of Object.keys(AB_TESTS) as AbTestId[]) {
      if (isVariant(parsed?.[test])) out[test] = parsed[test] as AbVariant;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Избира seed, чиито bucket-и възпроизвеждат старите запомнени варианти при
 * ТЕКУЩИТЕ прагове. Така преминаването към bucket модела не мести никого, а
 * бъдещо вдигане на прага вкарва старите „control“ във „variant“ както трябва.
 */
export function seedMatchingLegacy(legacy: Overrides, draw: () => string = randomSeed): string {
  const constraints = (Object.entries(legacy) as Array<[AbTestId, AbVariant]>).filter(
    ([test]) => test in AB_TESTS,
  );
  let seed = draw();
  if (constraints.length === 0) return seed;
  for (let attempt = 0; attempt < 512; attempt++) {
    const ok = constraints.every(([test, expected]) => {
      const cfg = AB_TESTS[test];
      return resolveVariant(bucketFor(seed, cfg.id, cfg.version), cfg.split) === expected;
    });
    if (ok) return seed;
    seed = draw();
  }
  return seed;
}

/** Стабилният seed на браузъра (тегли се веднъж; мигрира стария ключ). */
export function getAbSeed(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(SEED_KEY);
    if (existing && /^[a-z0-9]{8,64}$/i.test(existing)) return existing;
  } catch {
    return "no-storage";
  }
  const legacy = readLegacyVariants();
  const seed = seedMatchingLegacy(legacy);
  try {
    localStorage.setItem(SEED_KEY, seed);
    localStorage.removeItem(LEGACY_VARIANTS_KEY);
  } catch { /* quota / private mode — вариантът важи само за този зареждане */ }
  return seed;
}

/* -------------------------------- Override ------------------------------- */

function readSessionOverrides(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Overrides = {};
    for (const test of Object.keys(AB_TESTS) as AbTestId[]) {
      if (isVariant(parsed?.[test])) out[test] = parsed[test] as AbVariant;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Форсиране на вариант през URL (?ab_quick_preview=variant) — за QA/ботове.
 * Важи само за текущия таб и НЕ променя постоянното присвояване.
 */
export function applyAbOverridesFromUrl(search: string) {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(search);
    const overrides = readSessionOverrides();
    let changed = false;
    for (const test of Object.keys(AB_TESTS) as AbTestId[]) {
      const val = params.get(`ab_${test}`);
      if (isVariant(val)) {
        overrides[test] = val;
        changed = true;
      }
    }
    if (changed) sessionStorage.setItem(SESSION_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch { /* ignore */ }
}

/* --------------------------------- API ----------------------------------- */

/** Bucket на текущия браузър за даден тест (0…9999). */
export function getBucket(test: AbTestId): number {
  const cfg = AB_TESTS[test];
  return bucketFor(getAbSeed(), cfg.id, cfg.version);
}

/** Стабилен вариант за даден тест при текущия праг (override само в таба). */
export function getVariant(test: AbTestId): AbVariant {
  const override = readSessionOverrides()[test];
  if (override) return override;
  return resolveVariant(getBucket(test), AB_TESTS[test].split);
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
