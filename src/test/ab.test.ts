/**
 * Тестове за rollout рамката: стабилен bucket на браузър, монотонно вдигане на
 * прага, миграция на старото запомнено присвояване и non-sticky QA override.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/funnel", () => ({ trackFunnelEvent: vi.fn() }));

import {
  AB_BUCKETS,
  AB_TESTS,
  abProps,
  applyAbOverridesFromUrl,
  bucketFor,
  fnv1a,
  getAbSeed,
  getBucket,
  getVariant,
  resolveVariant,
  seedMatchingLegacy,
  __resetAbSeedMemory,
} from "@/lib/ab";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Резервният seed в паметта живее колкото модула — иначе се пренася между тестове.
  __resetAbSeedMemory();
});

describe("bucketFor / resolveVariant", () => {
  it("е детерминистичен и в диапазона 0…9999", () => {
    const a = bucketFor("seed-1", "activation_continuity", 1);
    expect(a).toBe(bucketFor("seed-1", "activation_continuity", 1));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(AB_BUCKETS);
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("различни тестове/версии дават независими bucket-и", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const same = seeds.filter(
      (s) => bucketFor(s, "activation_continuity", 1) === bucketFor(s, "activation_continuity", 2),
    );
    expect(same.length).toBeLessThan(10);
  });

  it("разпределението е близко до прага", () => {
    const seeds = Array.from({ length: 5000 }, (_, i) => `seed-${i}`);
    const share =
      seeds.filter((s) => resolveVariant(bucketFor(s, "t", 1), 0.25) === "variant").length / seeds.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it("вдигането на прага е монотонно: никой във variant не се връща в control", () => {
    for (let b = 0; b < AB_BUCKETS; b += 37) {
      const at25 = resolveVariant(b, 0.25);
      const at50 = resolveVariant(b, 0.5);
      const at100 = resolveVariant(b, 1);
      if (at25 === "variant") expect(at50).toBe("variant");
      if (at50 === "variant") expect(at100).toBe("variant");
      expect(at100).toBe("variant");
    }
    expect(resolveVariant(0, 0)).toBe("control");
  });
});

describe("seed и миграция", () => {
  it("тегли seed веднъж и го пази между повиквания", () => {
    const s1 = getAbSeed();
    expect(getAbSeed()).toBe(s1);
    expect(localStorage.getItem("ab_seed_v2")).toBe(s1);
  });

  it("възпроизвежда старите варианти при текущите прагове и маха стария ключ", () => {
    localStorage.setItem(
      "ab_variants_v1",
      JSON.stringify({ activation_continuity: "control", quick_preview: "variant" }),
    );
    // activation_continuity е изключен (split=0) → винаги control.
    expect(getVariant("activation_continuity")).toBe("control");
    // quick_preview е активен → запазва запомнения variant.
    expect(getVariant("quick_preview")).toBe("variant");
    expect(localStorage.getItem("ab_variants_v1")).toBeNull();
    expect(localStorage.getItem("ab_seed_v2")).not.toBeNull();
  });

  it("seedMatchingLegacy намира seed, който удовлетворява ограниченията", () => {
    let i = 0;
    const draw = () => `d${i++}`;
    const seed = seedMatchingLegacy({ quick_preview: "variant" }, draw);
    const cfg = AB_TESTS.quick_preview;
    expect(resolveVariant(bucketFor(seed, cfg.id, cfg.version), cfg.split)).toBe("variant");
  });

  it("emergency kill-switch за activation_continuity е заключен на split 0", () => {
    expect(AB_TESTS.activation_continuity.split).toBe(0);
  });

  it("не приема повреден seed в хранилището", () => {
    localStorage.setItem("ab_seed_v2", "<script>");
    const seed = getAbSeed();
    expect(seed).not.toBe("<script>");
    expect(seed).toMatch(/^[a-z0-9]{8,64}$/i);
  });
});

describe("QA override", () => {
  it("важи само за таба и не пипа постоянното присвояване", () => {
    // Seed с bucket извън прага → control.
    let seed = "x";
    for (let i = 0; i < 2000; i++) {
      const cand = `candseed${i}`;
      if (resolveVariant(bucketFor(cand, "activation_continuity", 1), AB_TESTS.activation_continuity.split) === "control") {
        seed = cand;
        break;
      }
    }
    localStorage.setItem("ab_seed_v2", seed);
    expect(getVariant("activation_continuity")).toBe("control");

    applyAbOverridesFromUrl("?ab_activation_continuity=variant&ab_bogus=variant&ab_quick_preview=nope");
    expect(getVariant("activation_continuity")).toBe("variant");
    expect(abProps().ab_activation_continuity).toBe("variant");
    // Постоянният bucket е непроменен.
    expect(getBucket("activation_continuity")).toBe(bucketFor(seed, "activation_continuity", 1));
    expect(localStorage.getItem("ab_seed_v2")).toBe(seed);

    sessionStorage.clear();
    expect(getVariant("activation_continuity")).toBe("control");
  });
});

describe("изключено хранилище", () => {
  const real = window.localStorage;
  function breakStorage() {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("denied"); },
        removeItem() { throw new Error("denied"); },
        clear() { throw new Error("denied"); },
        key() { return null; },
        length: 0,
      },
    });
  }
  afterEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: real });
    __resetAbSeedMemory();
  });

  it("seed-ът е стабилен за живота на страницата и не е един и същ за всички", () => {
    breakStorage();
    __resetAbSeedMemory();
    const a = getAbSeed();
    expect(a).toMatch(/^[a-z0-9]{8,64}$/i);
    expect(getAbSeed()).toBe(a);
    // Стабилен вариант в рамките на зареждането.
    expect(getVariant("activation_continuity")).toBe(getVariant("activation_continuity"));
    // Друг браузър (ново зареждане) получава свой seed — не константа.
    const seeds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      __resetAbSeedMemory();
      seeds.add(getAbSeed());
    }
    expect(seeds.size).toBeGreaterThan(1);
  });
});
