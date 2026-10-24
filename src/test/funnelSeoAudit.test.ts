// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildFunnelSeoPages } from "../../scripts/lib/funnelSeoPages";
describe("initial HTML funnel SEO policy", () => {
  it.each(["/auth", "/auth/callback", "/reset-password", "/account", "/checkout/return", "/produkti/rezultat", "/produkti/proverka-predi-podpis/start"])("private %s is noindex without fabricated account content", path => {
    const page = buildFunnelSeoPages().find(p => p.path === path);
    expect(page?.noindex).toBe(true);
    expect(page?.bodyHtml).toBe("");
  });
  it("plans get a dedicated public document rather than the homepage fallback", () => {
    const page = buildFunnelSeoPages().find(p => p.path === "/plans");
    expect(page?.noindex).not.toBe(true);
    expect(page?.bodyHtml).toContain("12,90");
    expect(page?.bodyHtml).toContain("19,90");
    expect(page?.bodyHtml).toContain("109");
  });
});