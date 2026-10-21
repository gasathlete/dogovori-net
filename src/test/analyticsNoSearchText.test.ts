import { describe, it, expect, vi, beforeEach } from "vitest";
import { setCookiePrefs, initAnalytics } from "@/lib/analytics";
import { trackPageview } from "@/lib/pageviewTracker";
import { withCatalogQuery } from "@/pages/Catalog";

const SENTINEL = "ЕГН8001011234 таен";
const ENC = encodeURIComponent(SENTINEL);

describe("analytics never sees catalog search text", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
    window.history.replaceState(null, "", `/catalog?q=${ENC}&utm_source=news`);
    Object.defineProperty(document, "referrer", { value: `${window.location.origin}/catalog?q=${ENC}`, configurable: true });
  });

  it("first-party pageview/duration and gtag config/pageview exclude the query", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { bodies.push(String(init.body)); return new Response("{}"); }));
    setCookiePrefs({ analytics: true, marketing: false }); // consent → initAnalytics (config)
    initAnalytics();
    trackPageview(`/catalog?q=${ENC}`);
    trackPageview("/"); // emits duration_update for the previous page
    await vi.advanceTimersByTimeAsync(6000);

    const firstParty = bodies.join("\n");
    expect(firstParty).toContain('"path":"/catalog"');
    expect(firstParty).toContain("duration_update");
    expect(firstParty).toContain('"utm_source":"news"');
    const gtagArgs = JSON.stringify(((window as unknown as { dataLayer: IArguments[] }).dataLayer).map((a) => Array.from(a)));
    expect(gtagArgs).toContain("page_view");
    for (const out of [firstParty, gtagArgs]) {
      expect(out).not.toContain(SENTINEL);
      expect(out).not.toContain(ENC);
      expect(out).not.toContain("q=");
    }
  });

  it("the catalog URL itself still carries the search", () => {
    expect(withCatalogQuery(new URLSearchParams(), SENTINEL).get("q")).toBe(SENTINEL);
  });
});
