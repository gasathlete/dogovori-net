/**
 * Одит на безплатните PDF наръчници (lead magnets).
 *
 * Три нива:
 *  1. Съдържание (чисти данни): забранени формулировки, задължителни цитати,
 *     официални източници, disclaimer, номерация.
 *  2. Рендер: детерминистичен изход, без предупреждения за препълване,
 *     фиксирани метаданни, файловете в `public/lead-magnets/` са байт-за-байт
 *     равни на текущия източник (иначе: `bun run scripts/generate-lead-magnets.ts`).
 *  3. Извлечен текст (pdf.js): кирилицата се извлича коректно, колонтитулът с
 *     disclaimer и номерацията са на всяка страница, линковете са кликаеми.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";

import { LEAD_MAGNETS, LEAD_MAGNET_SLUGS, type LeadMagnetSlug } from "@/lib/leadMagnets";
import {
  LEAD_MAGNET_PDF_DOCUMENTS,
  collectLeadMagnetTexts,
  collectLeadMagnetUrls,
  leadMagnetPublicPath,
} from "@/lib/leadMagnetPdf/content";
import {
  LEAD_MAGNET_PDF_ALLOWED_SOURCE_HOSTS,
  LEAD_MAGNET_PDF_AUTHOR,
  LEAD_MAGNET_PDF_BANNED_PHRASES,
  LEAD_MAGNET_PDF_CTA_HEADING,
  LEAD_MAGNET_PDF_CTA_HOST,
  LEAD_MAGNET_PDF_DISCLAIMER,
  LEAD_MAGNET_PDF_DISCLAIMER_LONG,
  LEAD_MAGNET_PDF_LAWYER_HEADING,
  LEAD_MAGNET_PDF_RECAP_HEADING,
  LEAD_MAGNET_PDF_REVIEW_DATE,
  LEAD_MAGNET_PDF_REVIEW_DATE_LABEL,
  LEAD_MAGNET_PDF_SOURCES_HEADING,
} from "@/lib/leadMagnetPdf/common";
import { renderLeadMagnetPdf, type RenderLeadMagnetResult } from "@/lib/leadMagnetPdf/render";
import type { LeadMagnetPdfDocument } from "@/lib/leadMagnetPdf/types";

const ROOT = resolve(__dirname, "../..");
const FONT_B64 = readFileSync(resolve(ROOT, "public/fonts/DejaVuSans.ttf")).toString("base64");

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const committedBytes = (slug: LeadMagnetSlug) =>
  new Uint8Array(readFileSync(resolve(ROOT, "public", leadMagnetPublicPath(slug).replace(/^\//, ""))));

/** Цитати, без които съответният наръчник не е верен спрямо действащия закон. */
const REQUIRED_CITATIONS: Record<LeadMagnetSlug, string[]> = {
  "rent-red-flags": [
    "чл. 233", // връщане на вещта / презумпция за добро състояние
    "чл. 231", // дребни поправки за сметка на наемателя
    "чл. 230", // състояние при предаване
    "чл. 229", // максимален срок
    "чл. 236", // продължаване след срока
    "чл. 237", // действие спрямо приобретателя
    "чл. 238", // прекратяване на безсрочен наем
    "чл. 92", // неустойка
    "чл. 37", // форма на пълномощното
    "ззд",
  ],
  "labor-checklist-2026": [
    "чл. 62", // писмена форма / регистър на заетостта
    "чл. 66", // задължително съдържание
    "чл. 70", // срок за изпитване
    "чл. 71",
    "чл. 119", // изменение по взаимно съгласие
    "чл. 127", // задължения на работодателя
    "чл. 155", // платен годишен отпуск
    "чл. 220", // обезщетение за неспазено предизвестие
    "чл. 326", // предизвестие
    "регистъра на заетостта",
    "1 юни 2025",
    "кт",
  ],
};

/** Формулировки, които трябва да присъстват именно в този правопис. */
const REQUIRED_SPELLINGS: Partial<Record<LeadMagnetSlug, string[]>> = {
  "rent-red-flags": ["приемно-предавателен"],
};

const EXPECTED_SECTIONS: Record<LeadMagnetSlug, number> = {
  "rent-red-flags": 10,
  "labor-checklist-2026": 12,
};

/**
 * Каноничните официални източници за всеки наръчник — точно този списък, в този ред.
 * Промяна на URL адрес тук е съзнателно редакционно решение, не страничен ефект.
 */
const EXPECTED_SOURCE_URLS: Record<LeadMagnetSlug, readonly string[]> = {
  "rent-red-flags": [
    "https://justice.government.bg/home/normdoc/2121934337",
    "https://ibl.bas.bg/ezikovispravki/vaprosi/pravopis-na-otdelni-dumi-i-formi-flumaster-simultanen-2/322",
  ],
  "labor-checklist-2026": [
    "https://justice.government.bg/home/normdoc/1594373121",
    "https://nra.bg/wps/portal/nra/osiguryavane/Registur_na_zaetostta",
    "https://nra.bg/wps/portal/nra/osiguryavane/Registur_na_zaetostta/vuprosi-i-otgovori-za-registura-na-zaetostta",
    "https://www.gli.government.bg/bg/taxonomy/term/360/node/13677",
  ],
};

const EXPECTED_CTA_URLS: Record<LeadMagnetSlug, string> = {
  "rent-red-flags": "https://dogovori.net/shablon/dogovor-za-naem-na-zhilishte",
  "labor-checklist-2026": "https://dogovori.net/shablon/trudov-dogovor-po-chl-67-kt-bezsrochen",
};

/** Остарели/неканонични адреси — не трябва да се появяват в нито един наръчник (текст, източници, линкове, байтове). */
const OBSOLETE_URLS = [
  "https://nra.bg/wps/portal/nra/registar-na-zaetostta",
  "https://nra.bg/wps/portal/nra/registar-na-zaetostta/vaprosi-i-otgovori-registar-na-zaetostta",
  "https://gli.government.bg/bg/taxonomy/list/396",
] as const;

/** Характерни фрагменти на остарелите адреси — хващат и варианти с друг протокол/хост/окончание. */
const OBSOLETE_URL_FRAGMENTS = ["registar-na-zaetostta", "vaprosi-i-otgovori-registar-na-zaetostta", "taxonomy/list/396"] as const;

/** Хост без водещо „www.“ — allowlist-ът е по регистрируем домейн. */
const bareHost = (host: string) => host.replace(/^www\./, "");

const docs = LEAD_MAGNET_SLUGS.map((slug) => [slug, LEAD_MAGNET_PDF_DOCUMENTS[slug]] as const);

describe("lead-magnet PDF — съдържание", () => {
  it("има документ за всеки slug от регистъра и заглавията съвпадат", () => {
    expect(Object.keys(LEAD_MAGNET_PDF_DOCUMENTS).sort()).toEqual([...LEAD_MAGNET_SLUGS].sort());
    for (const entry of Object.values(LEAD_MAGNETS)) {
      const doc = LEAD_MAGNET_PDF_DOCUMENTS[entry.slug];
      expect(doc.slug).toBe(entry.slug);
      expect(doc.title).toBe(entry.title);
      expect(entry.fileUrl).toMatch(/^\/lead-magnets\/[a-z0-9-]+\.pdf$/);
    }
  });

  describe.each(docs)("%s", (slug, doc: LeadMagnetPdfDocument) => {
    const texts = collectLeadMagnetTexts(doc);
    const joined = norm(texts.join("\n"));

    it("не съдържа забранени формулировки", () => {
      const hits = LEAD_MAGNET_PDF_BANNED_PHRASES.filter((p) => joined.includes(norm(p)));
      expect(hits).toEqual([]);
    });

    it("цитира задължителните разпоредби", () => {
      const missing = REQUIRED_CITATIONS[slug].filter((c) => !joined.includes(norm(c)));
      expect(missing).toEqual([]);
    });

    it("използва правилния правопис на ключовите термини", () => {
      for (const s of REQUIRED_SPELLINGS[slug] ?? []) expect(joined).toContain(norm(s));
    });

    it("разделите са номерирани последователно и в очаквания брой", () => {
      expect(doc.sections).toHaveLength(EXPECTED_SECTIONS[slug]);
      doc.sections.forEach((s, i) => {
        expect(s.number).toBe(i + 1);
        expect(s.title.trim().length).toBeGreaterThan(8);
        expect(s.lead.trim().length).toBeGreaterThan(40);
        expect(s.blocks.length).toBeGreaterThan(0);
      });
    });

    it("всеки раздел има поне един ред за проверка/договаряне", () => {
      for (const s of doc.sections) {
        const actionable = s.blocks.some(
          (b) => (b.kind === "checklist" || b.kind === "fields" || b.kind === "template") && (b.kind === "template" ? b.lines.length > 0 : b.items.length > 0),
        );
        expect(actionable, `раздел ${s.number} „${s.title}“`).toBe(true);
      }
    });

    it("източниците са само официални https публикации", () => {
      expect(doc.sources.items.length).toBeGreaterThanOrEqual(2);
      const hosts = doc.sources.items.map((s) => new URL(s.url).host);
      expect(hosts).toContain("justice.government.bg");
      for (const s of doc.sources.items) {
        const u = new URL(s.url);
        expect(u.protocol).toBe("https:");
        expect(LEAD_MAGNET_PDF_ALLOWED_SOURCE_HOSTS as readonly string[]).toContain(u.host);
        expect(s.label.trim().length).toBeGreaterThan(20);
      }
      const seen = new Set<string>();
      for (const u of collectLeadMagnetUrls(doc)) {
        expect(seen.has(u), `дублиран URL ${u}`).toBe(false);
        seen.add(u);
      }
    });

    it("CTA сочи към dogovori.net и е с честна бележка за ограниченията", () => {
      const u = new URL(doc.cta.url);
      expect(u.protocol).toBe("https:");
      expect(u.host === LEAD_MAGNET_PDF_CTA_HOST || u.host.endsWith(`.${LEAD_MAGNET_PDF_CTA_HOST}`)).toBe(true);
      expect(doc.cta.title).toBe(LEAD_MAGNET_PDF_CTA_HEADING);
      expect(norm(doc.cta.note)).toMatch(/адвокат/);
      expect(norm(doc.cta.note)).toMatch(/не (осигуряват|гарантират|заместват)/);
    });

    it("носи disclaimer, дата на проверка и общите раздели", () => {
      expect(texts).toContain(LEAD_MAGNET_PDF_DISCLAIMER);
      expect(texts).toContain(LEAD_MAGNET_PDF_DISCLAIMER_LONG);
      expect(joined).toContain(norm(LEAD_MAGNET_PDF_REVIEW_DATE_LABEL));
      expect(doc.whenLawyer.title).toBe(LEAD_MAGNET_PDF_LAWYER_HEADING);
      expect(doc.sources.title).toBe(LEAD_MAGNET_PDF_SOURCES_HEADING);
      expect(doc.whenLawyer.items.length).toBeGreaterThanOrEqual(4);
      expect(doc.metadata.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it("не използва рекламни или категорични обещания", () => {
      expect(joined).not.toMatch(/безрисков|напълно защитен|няма как да загубите|сигурна печалба/);
      expect(joined).not.toMatch(/\b(лв|лева|bgn)\b/);
    });
  });
});

describe("lead-magnet PDF — рендер", () => {
  const rendered = new Map<LeadMagnetSlug, RenderLeadMagnetResult>();

  beforeAll(() => {
    for (const [slug, doc] of docs) rendered.set(slug, renderLeadMagnetPdf(doc, { fontBase64: FONT_B64 }));
  }, 60_000);

  it.each(docs)("%s — рендерът е без предупреждения и в разумен обем", (slug) => {
    const r = rendered.get(slug)!;
    expect(r.warnings).toEqual([]);
    expect(r.pageCount).toBeGreaterThanOrEqual(6);
    expect(r.pageCount).toBeLessThanOrEqual(12);
    expect(r.bytes.length).toBeGreaterThan(20_000);
    expect(r.bytes.length).toBeLessThan(400_000);
  });

  it.each(docs)("%s — изходът е детерминистичен", (slug, doc) => {
    const a = rendered.get(slug)!.bytes;
    const b = renderLeadMagnetPdf(doc, { fontBase64: FONT_B64 }).bytes;
    expect(sha256(a)).toBe(sha256(b));
  }, 60_000);

  it.each(docs)("%s — метаданните са фиксирани (дата, автор, език)", (slug, doc) => {
    const head = Buffer.from(rendered.get(slug)!.bytes).toString("latin1");
    const ymd = LEAD_MAGNET_PDF_REVIEW_DATE.replace(/-/g, "");
    expect(head).toContain(`/CreationDate (D:${ymd}000000+00'00')`);
    expect(head).toContain("/Lang (bg)");
    expect(head).toContain(`/Author (${LEAD_MAGNET_PDF_AUTHOR})`);
    // Заглавието е с кирилица → jsPDF го записва като UTF-16BE с BOM (FE FF).
    expect(head).toContain("/Title (\u00FE\u00FF");
    expect(doc.title.length).toBeGreaterThan(0);
  });

  it.each(docs)("%s — файлът в public/lead-magnets е байт-за-байт актуален", (slug) => {
    const committed = committedBytes(slug);
    const fresh = rendered.get(slug)!.bytes;
    expect(
      sha256(committed),
      `public${leadMagnetPublicPath(slug)} не съответства на източника — изпълнете: bun run scripts/generate-lead-magnets.ts`,
    ).toBe(sha256(fresh));
  });
});

describe("lead-magnet PDF — извлечен текст (pdf.js)", () => {
  type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  let pdfjs: PdfJs;

  beforeAll(async () => {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
  });

  async function extract(slug: LeadMagnetSlug) {
    const data = committedBytes(slug);
    const task = pdfjs.getDocument({
      data,
      useWorkerFetch: false,
      disableFontFace: true,
      useSystemFonts: false,
    });
    const pdf = await task.promise;
    const pages: string[] = [];
    let links = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ");
      pages.push(text);
      const annots = (await page.getAnnotations()) as Array<{ subtype?: string; url?: string }>;
      links += annots.filter((a) => a.subtype === "Link" && typeof a.url === "string" && a.url.startsWith("https://")).length;
    }
    const meta = await pdf.getMetadata();
    await pdf.destroy();
    return { pages, links, info: meta.info as Record<string, unknown> };
  }

  it.each(docs)(
    "%s — кирилицата се извлича, всяка страница носи disclaimer и номерация",
    async (slug, doc) => {
      const { pages, links, info } = await extract(slug);
      const n = pages.length;
      expect(n).toBeGreaterThanOrEqual(6);

      const all = norm(pages.join("\n"));
      expect(all).toContain(norm(doc.title));
      expect(all).toContain(norm(LEAD_MAGNET_PDF_RECAP_HEADING));
      expect(all).toContain(norm(LEAD_MAGNET_PDF_LAWYER_HEADING));
      expect(all).toContain(norm(LEAD_MAGNET_PDF_SOURCES_HEADING));
      for (const s of doc.sections) expect(all).toContain(norm(s.title));
      for (const c of REQUIRED_CITATIONS[slug]) expect(all).toContain(norm(c));
      for (const p of LEAD_MAGNET_PDF_BANNED_PHRASES) expect(all).not.toContain(norm(p));
      // Няма „черни квадратчета“/липсващи глифи — pdf.js ги връща като U+FFFD.
      expect(all).not.toContain("\uFFFD");

      pages.forEach((p, i) => {
        const t = norm(p);
        expect(t, `стр. ${i + 1}`).toContain(norm(LEAD_MAGNET_PDF_DISCLAIMER));
        expect(t, `стр. ${i + 1}`).toContain(norm(`Стр. ${i + 1} от ${n}`));
      });

      // Всеки източник + CTA е кликаем линк (URL-ите на два реда дават повече анотации).
      expect(links).toBeGreaterThanOrEqual(doc.sources.items.length + 1);

      expect(info.Title).toBe(doc.title);
      expect(info.Author).toBe(LEAD_MAGNET_PDF_AUTHOR);
      expect(info.Language ?? "bg").toBe("bg");
    },
    60_000,
  );
});
