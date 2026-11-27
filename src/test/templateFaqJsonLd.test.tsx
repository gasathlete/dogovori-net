/**
 * Регресия (Organic 2): след като async съдържанието на шаблона приключи, в DOM
 * трябва да остане ТОЧНО един Helmet FAQPage блок — без преходен дубликат от
 * състоянието fallback → AI.
 */
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import TemplatePage from "@/pages/Template";

const GUARDED = "priemo-predavatelen-protokol";
const AI = "dogovor-za-naem-na-parkomyasto-garazh";

function ldBlocks() {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"][data-rh="true"]'))
    .map((s) => {
      try {
        return JSON.parse(s.textContent ?? "null");
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function typeCounts() {
  const counts: Record<string, number> = {};
  for (const b of ldBlocks()) {
    const t = String(b["@type"]);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

function renderTemplate(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/shablon/${slug}`]}>
        <Routes>
          <Route path="/shablon/:slug" element={<TemplatePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("Template JSON-LD — FAQPage без дубликат", () => {
  it("преходното състояние не подава FAQPage, а след settle има точно един", async () => {
    const { unmount } = renderTemplate(AI);

    // Преходно състояние: Breadcrumb/Article вече са налични, FAQPage — не.
    await waitFor(() => {
      expect(typeCounts().BreadcrumbList).toBe(1);
    });
    expect(typeCounts().FAQPage).toBeUndefined();


    await waitFor(
      () => {
        expect(typeCounts().FAQPage).toBe(1);
      },
      { timeout: 5000 },
    );

    const counts = typeCounts();
    expect(counts.FAQPage).toBe(1);
    expect(counts.BreadcrumbList).toBe(1);
    expect(counts.Article).toBe(1);
    expect(counts.Product).toBeUndefined();
    expect(counts.HowTo).toBeUndefined();
    expect(JSON.stringify(ldBlocks())).not.toContain('"price":"0"');
    expect(JSON.stringify(ldBlocks())).not.toContain('"price":0');

    unmount();
  });

  it("guarded (fallback) шаблон също завършва с точно един FAQPage", async () => {
    const { unmount } = renderTemplate(GUARDED);
    await waitFor(
      () => {
        expect(typeCounts().FAQPage).toBe(1);
      },
      { timeout: 5000 },
    );
    expect(typeCounts().Article).toBe(1);
    unmount();
  });

  it("SPA навигация между fallback и AI шаблон остава с един FAQPage", async () => {
    const { unmount } = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/shablon/${GUARDED}`, `/shablon/${AI}`]} initialIndex={1}>
          <Routes>
            <Route path="/shablon/:slug" element={<TemplatePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(
      () => {
        expect(typeCounts().FAQPage).toBe(1);
      },
      { timeout: 5000 },
    );
    const counts = typeCounts();
    expect(counts.FAQPage).toBe(1);
    expect(counts.BreadcrumbList).toBe(1);
    expect(counts.Article).toBe(1);
    unmount();
  });
});
