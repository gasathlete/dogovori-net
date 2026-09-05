/**
 * Гард срещу регресия при подготвената миграция за `metrics_overview`:
 * новият брояч `checkout_failed` НЕ трябва да маха `continuity` блока, който
 * вече е приложен в базата (drizzle/migrations/0005_...).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const NEXT = readFileSync(
  "supabase/migrations/20260904210000_metrics_overview_checkout_failed.sql",
  "utf8",
);
const APPLIED = readFileSync(
  "drizzle/migrations/0005_metrics_overview_add_continuity.sql",
  "utf8",
);

/** Имената на JSON ключовете, които функцията връща. */
function jsonKeys(sql: string): string[] {
  return [...sql.matchAll(/'([a-z0-9_]+)',\s*(?:stage|c)\./g)].map((m) => m[1]);
}

describe("metrics_overview — checkout_failed без загуба на continuity", () => {
  it("пази всички полета от приложената версия", () => {
    const applied = jsonKeys(APPLIED);
    expect(applied.length).toBeGreaterThan(5);
    for (const key of applied) expect(jsonKeys(NEXT)).toContain(key);
  });

  it("запазва блока continuity (drafts, claim, post-auth)", () => {
    expect(NEXT).toContain("'continuity'");
    for (const marker of ["draft", "claim"]) {
      expect(NEXT.toLowerCase()).toContain(marker);
    }
  });

  it("добавя точно новия брояч checkout_failed", () => {
    expect(APPLIED).not.toContain("checkout_failed");
    expect(NEXT).toContain("checkout_failed");
    expect(NEXT).toContain("FILTER (WHERE name = 'checkout_failed')");
  });
});
