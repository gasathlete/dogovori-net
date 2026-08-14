/**
 * Статичен guard: никой компонент/страница не бива да съдържа твърдо зададени
 * цени или изоставени валути — единственият източник е `src/lib/pricing.ts`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src/components", "src/pages"];
/** Страници с юридически/дълъг текст, поддържани ръчно. */
const ALLOWLIST = [
  path.normalize("src/pages/legal/"),
  path.normalize("src/pages/Plans.tsx"),
  path.normalize("src/pages/Team.tsx"),
  path.normalize("src/pages/Template.tsx"),
  path.normalize("src/pages/admin"),
  path.normalize("src/pages/Admin"),
  path.normalize("src/components/admin/"),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap(walk).filter(
  (f) => !ALLOWLIST.some((a) => path.normalize(f).includes(a)),
);

/** Цена с EUR знак, изписана като литерал (напр. „19.90 €“ / „19,90 €“). */
const PRICE_LITERAL = /\d{1,3}[.,]\d{2}\s?€/;
const LEGACY_CURRENCY = /(?:^|[\s"'`>(])(?:лв\.?|лева|BGN)(?=$|[\s"'`<),.])/m;

describe("никакви твърдо зададени цени в UI", () => {
  it("намира файлове за проверка", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("няма литерални EUR цени извън pricing.ts", () => {
    const offenders = files.filter((f) => PRICE_LITERAL.test(readFileSync(f, "utf8")));
    expect(offenders, `Използвай helper-ите от @/lib/pricing в: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("няма BGN/лева никъде в UI", () => {
    const offenders = files.filter((f) => LEGACY_CURRENCY.test(readFileSync(f, "utf8")));
    expect(offenders, `Само EUR е валидна валута. Поправи: ${offenders.join(", ")}`).toEqual([]);
  });
});
