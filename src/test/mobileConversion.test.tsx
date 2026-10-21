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
  it("има точно петте основни изхода в поискания ред", () => {
    expect(MOBILE_NAV_ITEMS.map((i) => [i.label, i.to])).toEqual([
      ["Начало", "/"],
      ["Каталог", "/catalog"],
      ["Изготви", "/build"],
      ["DogovaryAI", "/assistant"],
      ["Профил", "/account"],
    ]);
  });

  it("активният маршрут се разпознава точно", () => {
    const byLabel = (l: string) => MOBILE_NAV_ITEMS.find((i) => i.label === l)!;
    expect(byLabel("Начало").match("/")).toBe(true);
    expect(byLabel("Начало").match("/catalog")).toBe(false);
    expect(byLabel("Каталог").match("/catalog/naem")).toBe(true);
    expect(byLabel("DogovaryAI").match("/assistant")).toBe(true);
    expect(byLabel("DogovaryAI").match("/")).toBe(false);
    expect(byLabel("Профил").match("/auth")).toBe(true);
    expect(byLabel("Изготви").match("/wizard/naem")).toBe(true);
  });

  it("DogovaryAI ползва брандовия знак, останалите иконки", () => {
    const ai = MOBILE_NAV_ITEMS.find((i) => i.label === "DogovaryAI")!;
    expect(ai.brandMark).toBe("/dogovai-favicon.png");
    for (const item of MOBILE_NAV_ITEMS.filter((i) => i.label !== "DogovaryAI")) {
      expect(item.icon).toBeTruthy();
    }
  });

  it("петте изхода се разполагат в пет колони при 360px", () => {
    const src = read("src/components/MobileBottomNav.tsx");
    expect(src).toContain("grid-cols-5");
    expect(src).toContain("min-h-[44px]");
    expect(src).not.toMatch(/w-\[\d{3,}px\]/);
  });
});

describe("hero — безплатното начало е водещо", () => {
  const hero = read("src/components/Hero.tsx");

  it("основният CTA е „Намерете документ“ към /catalog", () => {
    expect(hero).toContain('action="/catalog"');
    expect(hero).toContain("Намерете документ");
    expect(hero).not.toContain("Изберете какво Ви трябва");
  });

  it("основният CTA стои преди платения ред и е визуално по-силен", () => {
    expect(hero.indexOf("Намерете документ")).toBeLessThan(
      hero.indexOf("<HeroProductRail />"),
    );
    expect(hero).toMatch(/min-h-14/);
  });

  it("не обещава неограничено безплатно ползване", () => {
    // Каноничното правило вече живее на страницата „Започнете безплатно“, не в херото.
    expect(hero).not.toContain("FREE_OFFER_RULE");
    expect(hero.toLowerCase()).not.toContain("неограничен");
  });
});

describe("DogovaryAI в началната страница", () => {
  const home = read("src/components/home/HomeSections.tsx");

  it("стои след пакетите, комплектите и продуктовата секция", () => {
    const products = home.indexOf("<ProductsSection />");
    const ai = home.indexOf("<DogovaryAIShowcase />");
    const kits = home.indexOf("<LifeScenarios />");
    expect(products).toBeGreaterThan(-1);
    expect(kits).toBeLessThan(products);
    expect(ai).toBeGreaterThan(products);
  });

  it("има точно едно място в композицията", () => {
    expect(home.split("<DogovaryAIShowcase />").length - 1).toBe(1);
  });

  it("води към /assistant, без плаващо балонче", () => {
    const showcase = read("src/components/home/DogovaryAIShowcase.tsx");
    expect(showcase).toContain('to="/assistant"');
    expect(showcase).not.toContain('new CustomEvent("dogovai:open")');
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
    // Обхватът се казва веднъж — за целия ред, не на всяка карта.
    expect(screen.getAllByText(/За един документ\. Без абонамент\./)).toHaveLength(1);
    expect(screen.getByText(/Покупките още не са активни\./)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Еднократни продукти" })).toBeInTheDocument();
  });

  it("няма автоматична въртележка, popup или изкуствен недостиг", () => {
    const src = read("src/components/products/HeroProductRail.tsx");
    expect(src).not.toMatch(/setInterval|setTimeout|autoplay|Dialog/);
    expect(src.toLowerCase()).not.toMatch(/остават само|последен шанс/);
    expect(src).toContain("min-h-[168px]");
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

  it("на телефон се монтират точно четири компонента", () => {
    const mounted = [...mobileOverlays.matchAll(/<([A-Z][A-Za-z]+) \/>/g)].map((m) => m[1]);
    expect(mounted).toEqual([
      "PaymentTestModeBanner",
      "CookieBanner",
      "MobileBottomNav",
      "MobileAssistantOpenBridge",
    ]);
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

  it("десктоп наслояванията остават, без остарелия no-op beta popup", () => {
    const desktopOverlays = app.slice(app.indexOf("  return (\n    <Suspense fallback={null}>"));
    for (const c of ["GlobalProUpgradeListener", "ActionCelebrationHost", "CommandPalette", "DogovAIBubble"]) {
      expect(desktopOverlays).toContain(c);
    }
    expect(app).not.toContain("BetaDisclaimerModal");
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
    expect(header).toContain("h-[68px] xl:h-16");
    expect(header).toContain("h-16 xl:h-14");
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
    expect(audience).toContain("По-малко бюрокрация.");
    expect(audience).toContain("Помагаме на хората и малкия и средния бизнес да се справят с ежедневната бюрокрация.");
  });

  it("основното действие е каталогът, а второстепенните са реални пътища с честен статус", () => {
    expect(hero).toContain("Намерете документ");
    expect(hero).toContain('action="/catalog"');
    expect(hero).toContain('to="/build"');
    expect(hero).toContain("Изготвяне · В подготовка");
    expect(hero).toContain('to="/analiz"');
    expect(hero).toContain("Проверка · В подготовка");
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
    for (const label of ["Избирате", "Поставяте текст", "Получавате"]) {
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
