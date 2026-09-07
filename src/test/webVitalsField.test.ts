/**
 * Полеви Web Vitals: агрегация, границите на p75 банда, UTC прозорците на
 * администраторския изглед, включителните прагове и инвариантите на РЕАЛНАТА
 * pending миграция (privacy-minimal, admin-only четене, строга валидация).
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import type { Database } from "@/integrations/supabase/types";
import type {
  PendingDatabase,
  RecordWebVitalAggregateArgs,
  WebVitalsDailyRow,
} from "@/lib/webVitals/pendingSchema";
import {
  denormalize,
  formatMetricValue,
  p75Band,
  summarizeMetric,
  windowStartDay,
  type DailyRow,
} from "@/lib/webVitals/fieldAggregation";
import {
  CORE_THRESHOLDS,
  ratingForValue,
  toIntegerValue,
  isRating,
} from "@/lib/webVitals/dimensions";

const MIGRATION_PATH = "supabase/migrations/20260907110000_web_vitals_daily_aggregate.sql";
const LEGACY_DOCS_PATH = "docs/db/20260907110000_web_vitals_daily_aggregate.sql";

const row = (o: Partial<DailyRow>): DailyRow => ({
  metric: "LCP",
  rating: "good",
  device_class: "mobile",
  sample_count: 1,
  value_sum: 1000,
  ...o,
});

describe("p75 банд от агрегати", () => {
  it("точно 75% good → Good", () => {
    expect(p75Band({ good: 75, "needs-improvement": 10, poor: 15 })).toBe("good");
  });

  it("под 75% good, но good+NI ≥ 75% → Needs improvement", () => {
    expect(p75Band({ good: 60, "needs-improvement": 15, poor: 25 })).toBe("needs-improvement");
  });

  it("иначе → Poor", () => {
    expect(p75Band({ good: 50, "needs-improvement": 20, poor: 30 })).toBe("poor");
  });

  it("без данни → unknown", () => {
    expect(p75Band({ good: 0, "needs-improvement": 0, poor: 0 })).toBe("unknown");
  });
});

describe("summarizeMetric", () => {
  it("сумира брой и средно, нормализира CLS", () => {
    const rows: DailyRow[] = [
      row({ metric: "CLS", rating: "good", sample_count: 2, value_sum: 100 }),
      row({ metric: "CLS", rating: "poor", sample_count: 2, value_sum: 700, device_class: "desktop" }),
      row({ metric: "LCP", sample_count: 5, value_sum: 5000 }),
    ];
    const cls = summarizeMetric(rows, "CLS");
    expect(cls.samples).toBe(4);
    expect(cls.average).toBeCloseTo(0.2, 5); // (800/4)/1000
    expect(cls.goodRate).toBe(0.5);
    expect(cls.p75Band).toBe("poor");
    expect(cls.byDevice.mobile.samples).toBe(2);
    expect(cls.byDevice.desktop.goodRate).toBe(0);
  });

  it("нормализация и форматиране", () => {
    expect(denormalize("CLS", 125)).toBeCloseTo(0.125, 6);
    expect(denormalize("LCP", 2400)).toBe(2400);
    expect(formatMetricValue("LCP", 2400.4)).toBe("2400 ms");
    expect(formatMetricValue("CLS", 0.1234)).toBe("0.123");
    expect(formatMetricValue("INP", null)).toBe("—");
  });

  it("приема директно редове с генерирания тип Row", () => {
    const generated: PendingDatabase["public"]["Tables"]["web_vitals_daily"]["Row"] = {
      created_at: "2026-09-07T10:00:00Z",
      day: "2026-09-07",
      device_class: "mobile",
      metric: "INP",
      navigation_type: "navigate",
      rating: "good",
      route_group: "template",
      sample_count: 3,
      updated_at: "2026-09-07T10:00:00Z",
      value_max: 190,
      value_min: 120,
      value_sum: 450,
    };
    const s = summarizeMetric([generated], "INP");
    expect(s.samples).toBe(3);
    expect(s.average).toBe(150);
  });
});

describe("UTC прозорец на изгледа (windowStartDay)", () => {
  /** Броят на UTC датите от началото до „днес“ включително. */
  const inclusiveDays = (startIso: string, nowMs: number): number => {
    const start = Date.parse(`${startIso}T00:00:00Z`);
    const today = new Date(nowMs);
    today.setUTCHours(0, 0, 0, 0);
    return Math.round((today.getTime() - start) / 86_400_000) + 1;
  };

  it("7d = днес + предходните 6 UTC дати", () => {
    const now = Date.UTC(2026, 8, 7, 23, 59, 59); // 2026-09-07 23:59:59Z
    expect(windowStartDay(7, now)).toBe("2026-09-01");
    expect(inclusiveDays(windowStartDay(7, now), now)).toBe(7);
  });

  it("30d = днес + предходните 29 UTC дати", () => {
    const now = Date.UTC(2026, 8, 7, 0, 0, 0); // 2026-09-07 00:00:00Z
    expect(windowStartDay(30, now)).toBe("2026-08-09");
    expect(inclusiveDays(windowStartDay(30, now), now)).toBe(30);
  });

  it("не зависи от часа в денонощието (само UTC датата има значение)", () => {
    const early = Date.UTC(2026, 8, 7, 0, 0, 0);
    const late = Date.UTC(2026, 8, 7, 23, 59, 59, 999);
    expect(windowStartDay(7, early)).toBe(windowStartDay(7, late));
    expect(windowStartDay(30, early)).toBe(windowStartDay(30, late));
  });

  it("прескача правилно граница на месец и година", () => {
    expect(windowStartDay(7, Date.UTC(2026, 2, 3))).toBe("2026-02-25"); // 3 март → 25 февруари (7 дни)
    expect(windowStartDay(30, Date.UTC(2026, 0, 5))).toBe("2025-12-07"); // 5 януари → 7 декември (30 дни)
    expect(windowStartDay(7, Date.UTC(2028, 2, 1))).toBe("2028-02-24"); // високосна година
  });

  it("1d = само днес; невалиден вход се свежда до 1", () => {
    const now = Date.UTC(2026, 8, 7, 12);
    expect(windowStartDay(1, now)).toBe("2026-09-07");
    expect(windowStartDay(0, now)).toBe("2026-09-07");
    expect(windowStartDay(Number.NaN, now)).toBe("2026-09-07");
  });
});

describe("включителни прагове върху нормализираната скала", () => {
  it("константите съвпадат с актуалните Web Vitals прагове", () => {
    expect(CORE_THRESHOLDS.LCP).toEqual([2500, 4000]);
    expect(CORE_THRESHOLDS.INP).toEqual([200, 500]);
    expect(CORE_THRESHOLDS.CLS).toEqual([100, 250]);
  });

  it("точните граници са включителни (<=)", () => {
    expect(ratingForValue("LCP", 2500)).toBe("good");
    expect(ratingForValue("LCP", 2501)).toBe("needs-improvement");
    expect(ratingForValue("LCP", 4000)).toBe("needs-improvement");
    expect(ratingForValue("LCP", 4001)).toBe("poor");
    expect(ratingForValue("INP", 200)).toBe("good");
    expect(ratingForValue("INP", 201)).toBe("needs-improvement");
    expect(ratingForValue("INP", 500)).toBe("needs-improvement");
    expect(ratingForValue("INP", 501)).toBe("poor");
    expect(ratingForValue("CLS", 100)).toBe("good");
    expect(ratingForValue("CLS", 101)).toBe("needs-improvement");
    expect(ratingForValue("CLS", 250)).toBe("needs-improvement");
    expect(ratingForValue("CLS", 251)).toBe("poor");
  });

  it("нормализацията пази рейтинга на суровата стойност (ceil, без float шум)", () => {
    expect(toIntegerValue("CLS", 0.1)).toBe(100);
    expect(toIntegerValue("CLS", 0.25)).toBe(250);
    expect(toIntegerValue("CLS", 0.057)).toBe(57);
    expect(toIntegerValue("CLS", 0.1001)).toBe(101); // > 0.1 → вече не е good
    expect(toIntegerValue("LCP", 2500)).toBe(2500);
    expect(toIntegerValue("LCP", 2500.0001)).toBe(2501); // > 2500 → needs-improvement
    expect(toIntegerValue("INP", 200.4)).toBe(201);
    // FAIL CLOSED: невалидната стойност дава NaN, не 0 (0 би минало за "good").
    expect(toIntegerValue("LCP", -5)).toBeNaN();
    expect(toIntegerValue("LCP", Number.NaN)).toBeNaN();
    expect(toIntegerValue("LCP", Number.POSITIVE_INFINITY)).toBeNaN();
  });

  it("isRating приема само трите allow-list стойности", () => {
    expect(isRating("good")).toBe(true);
    expect(isRating("needs-improvement")).toBe(true);
    expect(isRating("poor")).toBe(true);
    expect(isRating("Good")).toBe(false);
    expect(isRating("ni")).toBe(false);
    expect(isRating(null)).toBe(false);
    expect(isRating(undefined)).toBe(false);
  });
});

describe("генерираните типове за web_vitals_daily / record_web_vital_aggregate", () => {
  type Tables = PendingDatabase["public"]["Tables"];
  type Fns = PendingDatabase["public"]["Functions"];

  it("таблицата има Row/Insert/Update с точните колони", () => {
    expectTypeOf<Tables["web_vitals_daily"]["Row"]>().toEqualTypeOf<{
      created_at: string;
      day: string;
      device_class: string;
      metric: string;
      navigation_type: string;
      rating: string;
      route_group: string;
      sample_count: number;
      updated_at: string;
      value_max: number;
      value_min: number;
      value_sum: number;
    }>();
    // Insert: измеренията са задължителни, броячите/датите имат DEFAULT.
    expectTypeOf<Tables["web_vitals_daily"]["Insert"]>().toMatchTypeOf<{
      device_class: string;
      metric: string;
      navigation_type: string;
      rating: string;
      route_group: string;
    }>();
    expectTypeOf<Tables["web_vitals_daily"]["Insert"]["sample_count"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Tables["web_vitals_daily"]["Update"]["metric"]>().toEqualTypeOf<string | undefined>();
  });

  it("RPC-то има Args без идентификатори и Returns void", () => {
    expectTypeOf<Fns["record_web_vital_aggregate"]["Args"]>().toEqualTypeOf<{
      _device_class: string;
      _metric: string;
      _navigation_type: string;
      _rating: string;
      _route_group: string;
      _value: number;
    }>();
    expectTypeOf<Fns["record_web_vital_aggregate"]["Returns"]>().toEqualTypeOf<undefined>();
  });

  it("схемата е декларирана точно веднъж и разширява генерирания Database", () => {
    const pending = readFileSync("src/lib/webVitals/pendingSchema.ts", "utf8");
    expect(pending).toContain("export type WebVitalsDailyRow = {");
    expect(pending).toContain("export type WebVitalsDailyInsert");
    expect(pending).toContain("export type WebVitalsDailyUpdate");
    expect(pending).toContain("export type RecordWebVitalAggregateArgs = {");
    expect(pending).toContain('Omit<Database, "public">');
    expect(pending.match(/web_vitals_daily: \{/g)?.length).toBe(1);
    expect(pending.match(/record_web_vital_aggregate: \{/g)?.length).toBe(1);
    // Генерираният файл е автоматичен — не се дописва ръчно преди миграцията.
    const generated = readFileSync("src/integrations/supabase/types.ts", "utf8");
    expect(generated).not.toContain("web_vitals_daily");
    expect(generated).not.toContain("record_web_vital_aggregate");
    // Типовете на приложението пазят връзката с генерирания Database.
    expectTypeOf<PendingDatabase["public"]["Tables"]["profiles"]["Row"]>().toEqualTypeOf<
      Database["public"]["Tables"]["profiles"]["Row"]
    >();
    expectTypeOf<WebVitalsDailyRow>().toEqualTypeOf<Tables["web_vitals_daily"]["Row"]>();
    expectTypeOf<RecordWebVitalAggregateArgs>().toEqualTypeOf<Fns["record_web_vital_aggregate"]["Args"]>();
  });
});

describe("реалната pending миграция за web_vitals_daily", () => {
  const SQL = readFileSync(MIGRATION_PATH, "utf8");
  /** Само изпълнимият SQL, без коментарните редове. */
  const CODE = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  /** Тялото на RPC-то между $$ … $$. */
  const fnStart = SQL.indexOf("CREATE OR REPLACE FUNCTION public.record_web_vital_aggregate");
  const bodyStart = SQL.indexOf("$$", fnStart) + 2;
  const bodyEnd = SQL.indexOf("$$", bodyStart);
  const BODY = SQL.slice(bodyStart, bodyEnd);
  const BODY_CODE = BODY.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("живее под supabase/migrations и няма дубликат в docs/db", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(existsSync(LEGACY_DOCS_PATH)).toBe(false);
    expect(existsSync("docs/db")).toBe(false);
    expect(SQL).not.toContain("НЕ Е ПРИЛОЖЕНА");
    expect(fnStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
  });

  it("не съдържа идентифициращи колони или свободен текст", () => {
    for (const bad of [
      "user_id",
      "session_id",
      "ip_address",
      "user_agent",
      "referrer",
      "raw_path",
      "pathname",
      "props",
      "jsonb",
      "uuid",
    ]) {
      expect(CODE.toLowerCase()).not.toContain(bad);
    }
    // Всички измерения са ограничени с CHECK allow-list-и.
    expect(CODE).toContain("CHECK (metric IN ('LCP','INP','CLS'))");
    expect(CODE).toContain("CHECK (rating IN ('good','needs-improvement','poor'))");
    expect(CODE).toContain("CHECK (device_class IN ('mobile','tablet','desktop'))");
    expect(CODE).toContain("PRIMARY KEY (day, metric, rating, route_group, device_class, navigation_type)");
  });

  it("включва RLS, само admin SELECT и никакво директно писане от клиента", () => {
    expect(SQL).toContain("ENABLE ROW LEVEL SECURITY");
    expect(SQL).toContain("public.has_role(auth.uid(), 'admin')");
    expect(SQL).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
    expect(SQL).toContain("REVOKE ALL ON TABLE public.web_vitals_daily FROM PUBLIC, anon, authenticated");
    expect(SQL).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.web_vitals_daily\s+TO\s+(anon|authenticated)/i);
    expect(SQL).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.web_vitals_daily\s+TO\s+anon/i);
  });

  it("RPC-то е SECURITY DEFINER със заключен search_path и права само за изпълнение", () => {
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_web_vital_aggregate\(text, text, text, text, text, integer\)\s+FROM PUBLIC/,
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_web_vital_aggregate\(text, text, text, text, text, integer\)\s+TO anon, authenticated/,
    );
  });

  it("RPC-то не чете auth.uid, не приема идентификатори и няма динамичен SQL", () => {
    expect(BODY_CODE).not.toMatch(/auth\.uid/i);
    expect(BODY_CODE).not.toMatch(/auth\.jwt/i);
    expect(BODY_CODE).not.toMatch(/current_setting/i);
    expect(BODY_CODE).not.toMatch(/EXECUTE\s+format\(/i);
    const signature = SQL.slice(fnStart, SQL.indexOf(")", fnStart));
    expect(signature).toContain("_metric text");
    expect(signature).toContain("_rating text");
    expect(signature).toContain("_route_group text");
    expect(signature).toContain("_device_class text");
    expect(signature).toContain("_navigation_type text");
    expect(signature).toContain("_value integer");
    expect(signature.match(/\b_[a-z_]+\s+(text|integer)/g)?.length).toBe(6);
  });

  it("изрично отхвърля NULL за всеки аргумент ПРЕДИ каквото и да е сравнение", () => {
    const nullGuard = BODY_CODE.indexOf("IS NULL");
    const firstAllowlist = BODY_CODE.indexOf("NOT IN (");
    expect(nullGuard).toBeGreaterThan(-1);
    expect(firstAllowlist).toBeGreaterThan(nullGuard);
    for (const arg of ["_metric", "_rating", "_route_group", "_device_class", "_navigation_type", "_value"]) {
      expect(BODY_CODE).toMatch(new RegExp(`${arg}\\s+IS\\s+NULL`));
    }
    const guardBlock = BODY_CODE.slice(BODY_CODE.indexOf("IF _metric IS NULL"), BODY_CODE.indexOf("END IF;"));
    expect(guardBlock).toMatch(/THEN\s+RETURN;/);
  });

  it("валидира стриктно allow-list, граници и съответствие рейтинг ↔ стойност", () => {
    expect(BODY_CODE).toContain("IF _metric NOT IN ('LCP','INP','CLS') THEN RETURN; END IF;");
    expect(BODY_CODE).toContain("IF _rating NOT IN ('good','needs-improvement','poor') THEN RETURN; END IF;");
    expect(BODY_CODE).toContain("IF _device_class NOT IN ('mobile','tablet','desktop') THEN RETURN; END IF;");
    expect(BODY_CODE).toContain("v_max := CASE WHEN _metric = 'CLS' THEN 10000 ELSE 600000 END;");
    expect(BODY_CODE).toContain("IF _value < 0 OR _value > v_max THEN RETURN; END IF;");
    // Актуалните Web Vitals прагове, включителни, върху нормализираната скала.
    expect(BODY_CODE).toMatch(
      /WHEN 'LCP' THEN CASE WHEN _value <= 2500 THEN 'good' WHEN _value <= 4000 THEN 'needs-improvement' ELSE 'poor' END/,
    );
    expect(BODY_CODE).toMatch(
      /WHEN 'INP' THEN CASE WHEN _value <= 200\s+THEN 'good' WHEN _value <= 500\s+THEN 'needs-improvement' ELSE 'poor' END/,
    );
    expect(BODY_CODE).toMatch(
      /WHEN 'CLS' THEN CASE WHEN _value <= 100\s+THEN 'good' WHEN _value <= 250\s+THEN 'needs-improvement' ELSE 'poor' END/,
    );
    expect(BODY_CODE).toContain("IF v_expected_rating IS NULL OR _rating <> v_expected_rating THEN RETURN; END IF;");
    // Праговете в SQL съвпадат с клиентските константи.
    for (const [metric, [good, ni]] of Object.entries(CORE_THRESHOLDS)) {
      expect(BODY_CODE).toMatch(new RegExp(`WHEN '${metric}' THEN CASE WHEN _value <= ${good}\\s+THEN 'good' WHEN _value <= ${ni}\\s+THEN`));
    }
    // Валидацията предхожда записа.
    expect(BODY_CODE.indexOf("_rating <> v_expected_rating")).toBeLessThan(BODY_CODE.indexOf("INSERT INTO public.web_vitals_daily"));
  });

  it("обновява атомарно и растежът е ограничен от измеренията", () => {
    expect(BODY_CODE).toContain("INSERT INTO public.web_vitals_daily");
    expect(BODY_CODE).toContain("ON CONFLICT (day, metric, rating, route_group, device_class, navigation_type)");
    expect(BODY_CODE).toContain("sample_count = w.sample_count + 1");
    expect(BODY_CODE).toContain("LEAST(w.value_min");
    expect(BODY_CODE).toContain("GREATEST(w.value_max");
    expect(BODY_CODE.match(/INSERT INTO/g)?.length).toBe(1);
    // Точно един INSERT път — няма второ, „лог“-подобно писане.
    expect(CODE.match(/CREATE TABLE/g)?.length).toBe(1);
  });
});
