/**
 * Regression guard: правните страници (/terms, /privacy, /legal, /contacts)
 * трябва да получават head таговете си през канoничния <Seo /> компонент,
 * а не през ръчна мутация на document.title / meta[name=description].
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LegalLayout } from "@/pages/legal/LegalLayout";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/legal/LegalLayout.tsx"),
  "utf8",
);

describe("LegalLayout — SEO", () => {
  it("не мутира head ръчно", () => {
    expect(SRC).not.toMatch(/document\.title\s*=/);
    expect(SRC).not.toMatch(/querySelector\(\s*['"]meta/);
    expect(SRC).not.toMatch(/useEffect/);
  });

  it("използва <Seo /> с title, description и canonical от location.pathname", () => {
    expect(SRC).toMatch(/from "@\/components\/Seo"/);
    expect(SRC).toMatch(/useLocation/);
    expect(SRC).toMatch(/canonical=\{location\.pathname\}/);
    expect(SRC).toMatch(/\$\{title\} · Dogovori\.net/);
  });

  it("рендира пълен head набор за правна страница", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/terms"]}>
          <LegalLayout title="Общи условия" description="Условията за ползване на Dogovori.net.">
            <p>тяло</p>
          </LegalLayout>
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe("Общи условия · Dogovori.net");
    });

    const desc = document.querySelectorAll('meta[name="description"]');
    expect(desc).toHaveLength(1);
    expect(desc[0].getAttribute("content")).toBe("Условията за ползване на Dogovori.net.");

    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://dogovori.net/terms");
    expect(document.querySelector('meta[name="robots"]')).not.toBeNull();
    expect(
      document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
    ).toBe("https://dogovori.net/terms");
    expect(document.querySelector('meta[name="twitter:card"]')).not.toBeNull();
  });
});

describe("Terms 7.1 — еднократен пакет vs топ-ъп", () => {
  const TERMS = fs.readFileSync(path.resolve(__dirname, "../pages/legal/Terms.tsx"), "utf8");

  it("не съдържа старото подвеждащо заглавие", () => {
    expect(TERMS).not.toMatch(/Топ-ъп пакети операции \(само за активни абонати\)/);
  });

  it("разграничава 5 операции (без абонамент) от 20/50/100 (само абонати)", () => {
    expect(TERMS).toMatch(/5 операции за 2,90 €/);
    expect(TERMS).toMatch(/без нужда от активен абонамент/);
    expect(TERMS).toMatch(/20 операции — 5,40 € еднократно \(само за активни абонати\)/);
    expect(TERMS).toMatch(/50 операции — 12,90 € еднократно \(само за активни абонати\)/);
    expect(TERMS).toMatch(/100 операции — 23,90 € еднократно \(само за активни абонати\)/);
  });

  it("запазва истината за Стриктен документ и за 5-те операции", () => {
    expect(TERMS).toMatch(/24 часа от плащането/);
    expect(TERMS).toMatch(/неограничени и не използват операции/);
    expect(TERMS).toMatch(/не изтичат и не активират/);
  });
});
