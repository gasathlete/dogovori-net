/**
 * „Свали само бланка" е ОТДЕЛЕН клон на фунията.
 *
 * Инварианти:
 *  - шаблонната страница отчита blank CTA със собствено събитие и НИКОГА с
 *    `template_create_cta_clicked`;
 *  - подканата за вход при бланка се етикетира `download_blank`, не `generate`;
 *  - отварянето на уизарда без `?blank=1` не показва подкана, а blank потокът
 *    не отчита нито `doc_start`, нито `doc_generate_started`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Template — blank CTA е отделно събитие", () => {
  const src = read("src/pages/Template.tsx");

  it("blank линкът отчита template_blank_cta_clicked, не create", () => {
    expect(src).toContain('trackFunnelEvent("template_blank_cta_clicked"');
    expect(src).toContain('onClick={() => trackBlankCta("hero")}');
    const blankLink = src.slice(src.indexOf("blankWizardHref}"), src.indexOf("Свали само бланка"));
    expect(blankLink).not.toContain("trackCreateCta");
  });

  it("истинските CTA за създаване запазват template_create_cta_clicked", () => {
    expect(src).toContain('trackFunnelEvent("template_create_cta_clicked"');
    expect(src).toContain('onClick={() => trackCreateCta("hero")}');
    expect(src).toContain('onClick={() => trackCreateCta("content")}');
    expect(src).toContain('onClick={() => trackCreateCta("footer")}');
  });

  it("blank потокът не отчита doc_start", () => {
    expect(src).not.toContain("trackDocStart");
    expect(src).not.toContain("document_selected");
  });

  it("props-ите остават low-cardinality (slug, position, authenticated)", () => {
    const fn = src.slice(src.indexOf("const trackBlankCta"), src.indexOf("const pageTitle"));
    expect(fn).toContain("slug: entry.slug");
    expect(fn).toContain("position");
    expect(fn).toContain("authenticated: Boolean(user)");
    expect(fn).not.toContain("doc.name");
  });
});

describe("Wizard — подканата за бланка е download_blank", () => {
  const src = read("src/pages/Wizard.tsx");

  it("и двата blank call site-а подават intent: \"download_blank\"", () => {
    const calls = src.match(/goAuth\(\{ action: "Изтегляне на празна бланка"[^}]*\}/g) ?? [];
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c).toContain('intent: "download_blank"');
  });

  it("подразбиращото се намерение generate и генериращите call sites са непроменени", () => {
    expect(src).toContain('intent: opts?.intent ?? "generate"');
    expect(src).toContain('goAuth({ action: "Генериране на документа"');
  });

  it("blank ефектът не генерира документ и не отчита doc_start", () => {
    const eff = src.slice(src.indexOf("Auto-trigger blank download"), src.indexOf("Auto-trigger blank download") + 1400);
    expect(eff).not.toContain("handleGenerate");
    expect(eff).not.toContain("markDocSelected");
    expect(eff).not.toContain("trackDocStart");
    expect(eff).not.toContain("trackGenerate");
  });
});

// ---------------------------------------------------------------------------
// Поведенчески тест: InlineAuthDialog е единственото място, което отчита
// auth_prompt_shown — проверяваме реалния етикет за blank потока.
// ---------------------------------------------------------------------------
import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { trackFunnelEvent } = vi.hoisted(() => ({ trackFunnelEvent: vi.fn(() => true) }));
vi.mock("@/lib/funnel", () => ({ trackFunnelEvent }));
vi.mock("@/lib/ab", () => ({ abProps: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn() } },
}));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: {} } }));

import { InlineAuthDialog } from "@/components/auth/InlineAuthDialog";
import { openInlineAuth } from "@/lib/inlineAuth";
import { resetOnceStore } from "@/lib/funnelEvents";

beforeEach(() => {
  trackFunnelEvent.mockClear();
  resetOnceStore();
});

type Call = [string, Record<string, unknown>];
const calls = () => trackFunnelEvent.mock.calls as unknown as Call[];
const names = () => calls().map((c) => c[0]);
const propsOf = (name: string) => calls().find((c) => c[0] === name)?.[1] ?? {};

describe("auth_prompt_shown за празна бланка", () => {
  it("носи action=download_blank и никога generate", async () => {
    render(
      <MemoryRouter>
        <InlineAuthDialog />
      </MemoryRouter>,
    );
    openInlineAuth({
      action: "Изтегляне на празна бланка",
      intent: "download_blank",
      docKey: "services::molba",
      source: "wizard",
    });
    await waitFor(() => expect(names()).toContain("auth_prompt_shown"));
    const p = propsOf("auth_prompt_shown");
    expect(p.action).toBe("download_blank");
    expect(p.source).toBe("wizard");
    expect(names()).not.toContain("doc_start");
    expect(names()).not.toContain("doc_generate_started");
  });

  it("без подкана няма никакво auth_prompt_shown при монтиране", async () => {
    render(
      <MemoryRouter>
        <InlineAuthDialog />
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(names()).not.toContain("auth_prompt_shown");
  });
});
