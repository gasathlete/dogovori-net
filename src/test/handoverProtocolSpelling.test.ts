import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { slugify } from "@/lib/slugify";
import { allTemplates, getTemplateBySlug } from "@/lib/templateIndex";
import { CATALOG } from "@/data/catalog";

const CANONICAL_SLUG = "priemo-predavatelen-protokol";
const CANONICAL_DISPLAY = "Приемно-предавателен протокол";
const WRONG = /приемо-предавател/i;

/** Structural matching lists / spelling guards that intentionally keep the
 *  historical (wrong) spelling so legacy input still matches. */
const ALLOWED_FILES = new Set([
  "src/lib/leadMagnetPdf/common.ts",
  "src/lib/slugify.ts",
  "src/data/anchorDictionary.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const SOURCE_FILES = walk("src").filter(
  (p) => !p.startsWith(`src${path.sep}test${path.sep}`) && !ALLOWED_FILES.has(p.split(path.sep).join("/")),
);

describe("приемно-предавателен: visible copy spelling", () => {
  it("no user-facing source surface contains the Cyrillic misspelling", () => {
    const offenders = SOURCE_FILES.filter((p) => WRONG.test(fs.readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the guard does not reject preserved ASCII transliterated identifiers", () => {
    expect(WRONG.test("priemo-predavatelen-protokol")).toBe(false);
    expect(WRONG.test("src/data/templateContent/priemo-predavatelen-protokol.ts")).toBe(false);
    expect(WRONG.test("https://dogovori.net/shablon/priemo-predavatelen-protokol")).toBe(false);
    // and it does catch the real thing
    expect(WRONG.test("Приемо-предавателен протокол")).toBe(true);
  });

  it("the anchor dictionary keeps the legacy phrase as a matching input only", () => {
    const src = fs.readFileSync("src/data/anchorDictionary.ts", "utf8");
    const legacy = src.split("\n").filter((l) => WRONG.test(l));
    expect(legacy.length).toBeGreaterThan(0);
    for (const line of legacy) expect(line).toMatch(/phrases:/);
  });
});

describe("приемно-предавателен: public template metadata", () => {
  it("renders the corrected H1/title for the canonical slug", () => {
    const entry = getTemplateBySlug(CANONICAL_SLUG);
    expect(entry).toBeDefined();
    expect(entry!.doc.name).toBe(CANONICAL_DISPLAY);
    expect(entry!.doc.name).not.toMatch(WRONG);
    expect(entry!.doc.purpose).not.toMatch(WRONG);
    expect(entry!.doc.keyClause ?? "").not.toMatch(WRONG);
  });

  it("every catalog document name and copy uses the corrected spelling", () => {
    for (const cat of CATALOG) {
      for (const doc of cat.documents) {
        expect(`${doc.name} ${doc.purpose} ${doc.keyClause ?? ""}`).not.toMatch(WRONG);
      }
    }
  });
});

describe("приемно-предавателен: structural slug stability", () => {
  it("slugify keeps the legacy transliteration for the corrected display name", () => {
    expect(slugify(CANONICAL_DISPLAY)).toBe(CANONICAL_SLUG);
    expect(slugify("Приемно-предавателен протокол при продажба на имот")).toBe(
      "priemo-predavatelen-protokol-pri-prodazhba-na-imot",
    );
    expect(slugify("Приемо-предавателен протокол")).toBe(CANONICAL_SLUG);
  });

  it("all handover-protocol routes remain exactly unchanged and routable", () => {
    const expected = [
      "priemo-predavatelen-protokol",
      "priemo-predavatelen-protokol-pri-prodazhba-na-imot",
      "priemo-predavatelen-protokol-za-predavane-na-klyuchove",
      "priemo-predavatelen-protokol-za-predavane-na-stoki-produktsiya",
      "priemo-predavatelen-protokol-za-priemane-na-izvarshena-usluga",
      "priemo-predavatelen-protokol-za-mps",
    ];
    for (const slug of expected) {
      expect(getTemplateBySlug(slug), slug).toBeDefined();
    }
    // no route was renamed to the corrected spelling
    expect(allTemplates().filter((t) => /priemno-predavatelen/.test(t.slug))).toEqual([]);
  });

  it("keeps the per-slug content data files addressable under the legacy path", () => {
    for (const slug of [
      "priemo-predavatelen-protokol",
      "priemo-predavatelen-protokol-pri-prodazhba-na-imot",
    ]) {
      expect(fs.existsSync(`src/data/templateContent/${slug}.ts`)).toBe(true);
    }
  });
});
