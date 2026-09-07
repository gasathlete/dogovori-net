/**
 * Полеви Web Vitals: агрегация, границите на p75 банда и инвариантите на
 * подготвената SQL промяна (privacy-minimal, admin-only четене).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  denormalize,
  formatMetricValue,
  p75Band,
  summarizeMetric,
  type DailyRow,
} from "@/lib/webVitals/fieldAggregation";

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
});

describe("подготвената SQL промяна за web_vitals_daily", () => {
  const SQL = readFileSync("docs/db/20260907110000_web_vitals_daily_aggregate.sql", "utf8");

  it("не съдържа идентифициращи колони", () => {
    for (const bad of ["user_id", "session_id", "ip_address", "user_agent", "referrer", "raw_path", "props"]) {
      expect(SQL).not.toContain(bad);
    }
  });

  it("включва RLS и само admin SELECT, без писане от клиента", () => {
    expect(SQL).toContain("ENABLE ROW LEVEL SECURITY");
    expect(SQL).toContain("public.has_role(auth.uid(), 'admin')");
    expect(SQL).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE)/i);
  });

  it("RPC-то е SECURITY DEFINER със заключен search_path и права", () => {
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.record_web_vital_aggregate");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.record_web_vital_aggregate");
  });

  it("валидира стриктно и обновява атомарно", () => {
    expect(SQL).toContain("IF _metric NOT IN ('LCP','INP','CLS') THEN RETURN");
    expect(SQL).toContain("ON CONFLICT (day, metric, rating, route_group, device_class, navigation_type)");
    expect(SQL).toContain("sample_count = w.sample_count + 1");
    expect(SQL).toContain("LEAST(w.value_min");
    expect(SQL).toContain("GREATEST(w.value_max");
    expect(SQL).not.toMatch(/EXECUTE\s+format\(/i);
  });
});
