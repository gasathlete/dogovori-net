import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIENCE_COPY, DEFAULT_AUDIENCE } from "@/lib/audience";
import { TEST_PERIOD_LABEL } from "@/lib/prelaunch";

// The prerendered first paint of "/" is a capture of the real Header + Hero.
// If the live copy/CTA changes, re-run scripts/perf/capture-home-shell.py.
const shell = readFileSync(resolve(__dirname, "../../scripts/generated/home-shell.html"), "utf8");
const [header, hero] = shell.split("<!--hero-->");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("prerendered home shell", () => {
  it("has exactly one header and one hero with a single h1", () => {
    expect(header).toMatch(/^<header/);
    expect(hero.trim()).toMatch(/^<section/);
    expect(shell.match(/<h1/g)).toHaveLength(1);
  });

  it("matches the current default headline, primary CTA and test-period badge", () => {
    const { lead, accent, tail } = AUDIENCE_COPY[DEFAULT_AUDIENCE].heroHeadline;
    const h1 = text(hero.slice(hero.indexOf("<h1"), hero.indexOf("</h1>")));
    for (const part of [lead, accent, tail.trim()].filter(Boolean)) expect(h1).toContain(part);
    expect(hero).toMatch(/href="\/start"[^>]*data-testid="hero-primary-cta"|data-testid="hero-primary-cta"[^>]*href="\/start"/);
    expect(text(hero)).toContain("Започнете безплатно");
    expect(text(header)).toContain(TEST_PERIOD_LABEL);
  });

  it("uses the same preloaded poster and never bakes in video or session state", () => {
    expect(hero).toContain('srcset="/hero/hero-poster-960.webp 960w, /hero/hero-poster-1280.webp 1280w"');
    expect(shell).not.toContain("<video");
    expect(shell).not.toMatch(/Изход|Моят профил|@/);
  });
});
