/**
 * Фокусирани проверки за публичното индексиране на еднократните продукти.
 *
 * Тестовете четат само файлове от източника и вече изградения `dist/` —
 * нищо не се публикува, нищо не се извиква по мрежата.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONE_TIME_PRODUCTS } from "@/lib/products";
import { fmtEur } from "@/lib/pricing";

const SITE = "https://dogovori.net";
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const PUBLIC_PATHS = [
  "/produkti",
  ...ONE_TIME_PRODUCTS.map((p) => `/produkti/${p.slug}`),
];
const PRIVATE_PATHS = [
  "/produkti/rezultat",
  ...ONE_TIME_PRODUCTS.map((p) => `/produkti/${p.slug}/start`),
];

const BANNED = [
  "воден процес",
  "готови за поръчки",
  "скрити рискове",
  "без халюцинации",
  "не халюцинира",
  "без да измисля",
  "AI Юридически помощник",
  "AI юридически помощник",
  "600+",
  "290+",
  "251+",
];

describe("канонични продуктови адреси и цени", () => {
  it("трите продукта пазят точните канонични slug-ове и цени", () => {
    expect(
      ONE_TIME_PRODUCTS.map((p) => [`/produkti/${p.slug}`, p.priceEur]),
    ).toEqual([
      ["/produkti/proverka-predi-podpis", 2.99],
      ["/produkti/popravi-dokument", 3.99],
      ["/produkti/palen-paket-pregovori", 7.99],
    ]);
  });
});

describe("sitemap и robots", () => {
  const sitemap = read("public/sitemap-static.xml");
  const robots = read("public/robots.txt");

  it("включва четирите публични адреса с абсолютен canonical", () => {
    for (const p of PUBLIC_PATHS) {
      expect(sitemap).toContain(`<loc>${SITE}${p}</loc>`);
    }
  });

  it("не включва старт, плащане и резултат", () => {
    for (const p of PRIVATE_PATHS) expect(sitemap).not.toContain(`${SITE}${p}`);
    expect(sitemap).not.toContain("/checkout");
    expect(sitemap).not.toContain("/account");
  });

  it("robots.txt блокира частните продуктови пътища, но не публичните", () => {
    expect(robots).toContain("Disallow: /produkti/rezultat");
    expect(robots).toContain("Disallow: /produkti/*/start");
    for (const p of PUBLIC_PATHS) {
      expect(robots).not.toContain(`Disallow: ${p}\n`);
    }
  });

  it("не включва изтеглените адреси на бизнес картата", () => {
    expect(sitemap).not.toContain("biznes-karta");
  });
});

describe("базови метаданни в index.html", () => {
  const html = read("index.html");

  it("не съдържат остарели твърдения и брояч", () => {
    for (const bad of BANNED) expect(html).not.toContain(bad);
  });

  it("имат човешко заглавие и описание", () => {
    expect(html).toMatch(/<title>[^<]*Dogovori\.net[^<]*<\/title>/);
    expect(html).toMatch(/name="description" content="[^"]{40,}"/);
  });
});

const dist = resolve(root, "dist");
const hasDist = existsSync(resolve(dist, "produkti/index.html"));

describe.skipIf(!hasDist)("prerender изход за четирите адреса", () => {
  const load = (p: string) => read(`dist${p}/index.html`);
  const rootHtml = (html: string) =>
    (html.match(/<div id="root">([\s\S]*?)<\/body>/)?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const meta = (html: string, re: RegExp) => html.match(re)?.[1] ?? "";

  it("всеки адрес има собствен файл, уникално заглавие и точен canonical", () => {
    const titles = new Set<string>();
    for (const p of PUBLIC_PATHS) {
      const html = load(p);
      const title = meta(html, /<title>([^<]*)<\/title>/);
      expect(title.length).toBeGreaterThan(10);
      expect(titles.has(title)).toBe(false);
      titles.add(title);
      expect(html).toContain(`rel="canonical" href="${SITE}${p}"`);
      expect(meta(html, /name="robots" content="([^"]*)"/)).toContain("index");
      expect(meta(html, /name="robots" content="([^"]*)"/)).not.toContain(
        "noindex",
      );
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
      expect(html).toContain('property="og:title"');
      expect(html).toContain('name="twitter:card"');
    }
  });

  it("статичното тяло съдържа копие, цена и обозначен пример", () => {
    for (const p of PUBLIC_PATHS) {
      const text = rootHtml(load(p));
      expect(text.length).toBeGreaterThan(600);
      expect(text).toContain("Примерен резултат");
      expect(text).toContain("Демонстрация с примерен текст");
      for (const prod of ONE_TIME_PRODUCTS) {
        expect(text).toContain(fmtEur(prod.priceEur));
      }
      for (const bad of BANNED) expect(text).not.toContain(bad);
    }
  });

  it("витрината съдържа трите продукта и BreadcrumbList + ItemList", () => {
    const html = load("/produkti");
    for (const prod of ONE_TIME_PRODUCTS) {
      expect(html).toContain(`/produkti/${prod.slug}`);
      expect(rootHtml(html)).toContain(prod.name);
    }
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("продуктовите страници носят WebPage, Service с Offer и FAQPage", () => {
    for (const prod of ONE_TIME_PRODUCTS) {
      const html = load(`/produkti/${prod.slug}`);
      expect(html).toContain('"@type":"WebPage"');
      expect(html).toContain('"@type":"FAQPage"');
      const service = JSON.parse(
        html.match(
          /<script type="application\/ld\+json"[^>]*>(\{"@context":"https:\/\/schema\.org","@type":"Service"[\s\S]*?)<\/script>/,
        )![1],
      );
      expect(service.offers).toMatchObject({
        "@type": "Offer",
        price: prod.priceEur.toFixed(2),
        priceCurrency: "EUR",
        url: `${SITE}/produkti/${prod.slug}`,
      });
      expect(JSON.stringify(service)).not.toMatch(
        /aggregateRating|review|priceValidUntil/i,
      );
      // Видимият FAQ и схемата съвпадат.
      const faq = JSON.parse(
        html.match(
          /<script type="application\/ld\+json"[^>]*>(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/,
        )![1],
      );
      expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(
        prod.page.faq.map((f) => f.q),
      );
      const text = rootHtml(html);
      for (const f of prod.page.faq) expect(text).toContain(f.q);
      // Вътрешни връзки към другите продукти и плановете.
      for (const other of ONE_TIME_PRODUCTS.filter((o) => o.id !== prod.id)) {
        expect(html).toContain(`/produkti/${other.slug}`);
      }
      expect(html).toContain('href="/plans"');
      expect(text).toContain("Не е индивидуален правен съвет");
    }
  });
});
