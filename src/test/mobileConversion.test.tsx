/**
 * Мобилният конверсионен слой след връщането на предишния мобилен вид.
 *
 * Проверява: долната навигация, възстановената обща композиция на началната
 * страница (богат hero → лога → продукти), ранния продуктов ред, хедъра и
 * менюто, олекотените наслоявания и профила.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { MOBILE_NAV_ITEMS } from "@/components/MobileBottomNav";
import { HeroProductRail } from "@/components/products/HeroProductRail";
import { ONE_TIME_PRODUCTS, productPath, productPriceLabel } from "@/lib/products";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;
const read = (f: string) => readFileSync(f, "utf8");

describe("мобилна долна навигация", () => {
  it("има точно четири основни изхода в поискания ред", () => {
    expect(MOBILE_NAV_ITEMS.map((i) => [i.label, i.to])).toEqual([
      ["Продукти", "/produkti"],
      ["Качи", "/analiz"],
      ["Изготви", "/build"],
      ["Профил", "/account"],
    ]);
  });

  it("не съдържа каталог и DogovaryAI", () => {
    const labels = MOBILE_NAV_ITEMS.map((i) => i.label).join("|");
    expect(labels).not.toMatch(/Каталог|DogovaryAI/);
  });
});

describe("ранен продуктов ред в hero-а", () => {
  it("показва трите продукта като реални връзки с цени", () => {
    render(wrap(<HeroProductRail />));
    for (const p of ONE_TIME_PRODUCTS) {
      const link = screen.getByRole("link", { name: new RegExp(p.name) });
      expect(link).toHaveAttribute("href", productPath(p));
      expect(link).toHaveTextContent(productPriceLabel(p.id));
    }
    // „еднократно" се появява точно веднъж — за групата.
    expect(screen.getAllByText("еднократно")).toHaveLength(1);
  });

  it("няма автоматична въртележка, popup или изкуствен недостиг", () => {
    const src = read("src/components/products/HeroProductRail.tsx");
    expect(src).not.toMatch(/setInterval|setTimeout|autoplay|Dialog/);
    expect(src.toLowerCase()).not.toMatch(/остават само|последен шанс/);
    expect(src).toContain("min-h-[64px]");
  });

  it("е вграден в hero-а, а не в отделен мобилен екран", () => {
    expect(read("src/components/Hero.tsx")).toContain("<HeroProductRail />");
  });
});

describe("възстановена обща композиция на началната страница", () => {
  const index = read("src/pages/Index.tsx");
  const home = read("src/components/home/HomeSections.tsx");

  it("телефон и десктоп ползват една и съща композиция", () => {
    expect(index).toContain("<HomeSections />");
    expect(index).not.toContain("MobileHero");
    expect(index).not.toContain("MobileEssentials");
    expect(index).not.toMatch(/isMobile \? \(/);
  });

  it("богатият hero е първи, логата са преди продуктите", () => {
    expect(home.indexOf("<Hero />")).toBeGreaterThan(-1);
    expect(home.indexOf("<SocialProofStrip />")).toBeLessThan(
      home.indexOf("<ProductsSection />"),
    );
    expect(home.indexOf("<Hero />")).toBeLessThan(home.indexOf("<SocialProofStrip />"));
  });

  it("продуктите са преди Топ шаблоните и другите възможности", () => {
    expect(home.indexOf("<ProductsSection />")).toBeLessThan(
      home.indexOf("<FeaturedBlanks />"),
    );
    expect(home.indexOf("<ProductsSection />")).toBeLessThan(
      home.indexOf("<PlatformCapabilities />"),
    );
  });

  it("метаданните и JSON-LD не зависят от размера на екрана", () => {
    expect(index).toContain("buildFaqJsonLd()");
    expect(index).toContain("itemList ? [itemList, buildFaqJsonLd()] : [buildFaqJsonLd()]");
    expect(index).not.toContain("if (isMobile || !shouldPrefetch())");
    const seo = index.slice(index.indexOf("<Seo"), index.indexOf("<Header />"));
    expect(seo).not.toContain("isMobile");
  });

  it("дългата подредба остава пълна", () => {
    for (const c of [
      "Hero",
      "SocialProofStrip",
      "ProductsSection",
      "PrimaryChoice",
      "FeaturedBlanks",
      "PlatformCapabilities",
      "BrandedDocumentShowcase",
      "LifeScenarios",
      "Testimonials",
      "PainSolution",
      "ComparisonTable",
      "ComplianceSection",
      "DogovaryAIShowcase",
      "FAQ",
      "CTABand",
    ]) {
      expect(home).toContain(c);
    }
  });
});

describe("мобилни наслоявания и профил", () => {
  const app = read("src/App.tsx");
  const mobileOverlays = app.slice(app.indexOf("if (isMobile) {"), app.indexOf("  return (\n    <Suspense fallback={null}>"));

  it("на телефон се монтират точно три компонента", () => {
    const mounted = [...mobileOverlays.matchAll(/<([A-Z][A-Za-z]+) \/>/g)].map((m) => m[1]);
    expect(mounted).toEqual(["PaymentTestModeBanner", "CookieBanner", "MobileBottomNav"]);
  });

  it("нито предупредителен модал, нито празнични/upgrade слушатели на телефон", () => {
    for (const c of [
      "BetaDisclaimerModal",
      "GlobalProUpgradeListener",
      "ActionCelebrationHost",
      "ExitIntentLeadMagnet",
      "EntrepreneurAdPopup",
      "FreeWelcomeDialog",
      "CommandPalette",
      "DogovAIBubble",
      "UsernamePrompt",
    ]) {
      expect(mobileOverlays).not.toContain(c);
    }
  });

  it("десктоп наслояванията остават непокътнати", () => {
    const desktopOverlays = app.slice(app.indexOf("  return (\n    <Suspense fallback={null}>"));
    for (const c of ["BetaDisclaimerModal", "GlobalProUpgradeListener", "ActionCelebrationHost", "CommandPalette", "DogovAIBubble"]) {
      expect(desktopOverlays).toContain(c);
    }
  });

  it("явният таб печели, а action=upload води към съществуващ раздел", () => {
    const account = read("src/pages/Account.tsx");
    const init = account.slice(account.indexOf("const initialTab ="), account.indexOf("const activeContact"));
    expect(init.indexOf('params.get("tab")')).toBeLessThan(init.indexOf("isMobileViewport"));
    expect(init).toContain('"documents"');
    expect(init).toContain('"dashboard"');
    expect(init).not.toContain('"uploaded"');
  });

  it("мобилната навигация на профила е стабилна решетка, не хоризонтална лента", () => {
    const nav = read("src/pages/account/MobileAccountNav.tsx");
    expect(nav).toContain("grid-cols-3");
    expect(nav).not.toContain("overflow-x-auto");
    expect(nav).not.toContain("minWidth");
    const account = read("src/pages/Account.tsx");
    const primary = account.slice(account.indexOf("const MOBILE_PRIMARY_TABS"), account.indexOf("const MOBILE_SECONDARY_TABS"));
    expect([...primary.matchAll(/label: "([^"]+)"/g)].map((m) => m[1])).toEqual([
      "Документи",
      "Начало",
      "План",
    ]);
    expect(account).toContain("<MobileAccountNav");
  });
});

describe("мобилен хедър и меню", () => {
  const header = read("src/components/Header.tsx");

  it("връща предишните пропорции на хедъра, без промяна на десктоп", () => {
    expect(header).toContain("h-[68px] lg:h-16");
    expect(header).toContain("h-16 lg:h-14");
    expect(header).not.toContain("h-[58px]");
    expect(header).toContain("max-h-[calc(100dvh-68px)]");
  });

  it("„Продукти“ и „Планове“ са отделни водещи редове най-горе", () => {
    const primary = header.slice(header.indexOf("const MOBILE_PRIMARY"), header.indexOf("const MOBILE_MORE"));
    const labels = [...primary.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels[0]).toBe("Продукти");
    expect(labels[1]).toBe("Планове");
    expect(labels).toContain("Профил");
    // „Планове" не остава скрито в „Още".
    const more = header.slice(header.indexOf("const MOBILE_MORE"), header.indexOf("export function Header"));
    expect(more).not.toContain("Планове");
  });

  it("не повтаря Профил и дава един път изход", () => {
    const menu = header.slice(header.indexOf('aria-label="Мобилна навигация"'));
    expect(menu).not.toContain("Моят профил");
    expect((menu.match(/Изход/g) ?? []).length).toBe(1);
    const primary = header.slice(header.indexOf("const MOBILE_PRIMARY"), header.indexOf("const MOBILE_MORE"));
    expect((primary.match(/Профил/g) ?? []).length).toBe(1);
  });
});

describe("hero копие и продуктови карти", () => {
  const hero = read("src/components/Hero.tsx");
  const audience = read("src/lib/audience.ts");

  it("H1 и подкрепящият ред казват какво прави човекът", () => {
    expect(audience).toContain("Създайте, проверете или");
    expect(audience).toContain(" документ.");
    expect(audience).toContain("Започнете от шаблон или качете свой файл.");
  });

  it("основното действие води към продуктите, а второстепенните са реални пътища", () => {
    expect(hero).toContain("Изберете какво Ви трябва");
    expect(hero).toContain('to="/produkti"');
    expect(hero).toContain("Създайте документ");
    expect(hero).toContain("Качете за проверка");
  });

  it("септемврийската промоция не се конкурира с продуктите в hero-а", () => {
    expect(hero).not.toContain("SEPTEMBER_PROMO");
    expect(hero).not.toContain("−20%");
  });

  it("картите водят към собствените продуктови страници", () => {
    const card = read("src/components/products/ProductCard.tsx");
    expect(card).toContain("productPath(product)");
    expect(card).toContain("min-h-[44px]");
    expect(card).toContain("isFeaturedProduct");
    expect(card).not.toMatch(/scale-1[1-9]/);
  });

  it("трите карти са в DOM и на телефон (еднакво основно съдържание)", () => {
    const cards = read("src/components/products/ProductCards.tsx");
    expect(cards).not.toContain("MobileProductSwitcher");
    expect(cards).toContain("ONE_TIME_PRODUCTS.map");
  });

  it("трите стъпки са компактни и без обещание за време", () => {
    const strip = read("src/components/products/StepsStrip.tsx");
    for (const label of ["Избирате", "Качвате", "Получавате"]) {
      expect(strip).toContain(label);
    }
    expect(strip.toLowerCase()).not.toMatch(/минут|секунд|часа/);
    expect(read("src/pages/Products.tsx")).toContain("<StepsStrip />");
  });

  it("„Разгледайте нашите продукти“ остава точната водеща фраза", () => {
    expect(read("src/pages/Products.tsx")).toContain("Разгледайте нашите продукти");
  });
});

describe("медия hook", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("чете състоянието синхронно и премахва слушателя", async () => {
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    const { useIsMobileViewport } = await import("@/hooks/useMediaQuery");
    const seen: boolean[] = [];
    const Probe = () => {
      seen.push(useIsMobileViewport());
      return null;
    };
    const { unmount } = render(<Probe />);
    expect(seen[0]).toBe(true);
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });
});
