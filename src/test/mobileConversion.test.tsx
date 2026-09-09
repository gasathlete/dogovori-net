/**
 * Мобилният конверсионен слой: една задача на екран.
 *
 * Проверява реда/маршрутите на долната навигация, краткия мобилен начален
 * екран, продуктовия превключвател и олекотения слой от наслоявания.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { MOBILE_NAV_ITEMS } from "@/components/MobileBottomNav";
import { MobileProductSwitcher, DEFAULT_MOBILE_PRODUCT } from "@/components/products/MobileProductSwitcher";
import { getProduct, ONE_TIME_TERMS, productPriceLabel } from "@/lib/products";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));
import { trackFunnelEvent } from "@/lib/funnel";

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

describe("мобилен продуктов превключвател", () => {
  beforeEach(() => vi.clearAllMocks());

  it("по подразбиране показва най-лесната конверсия и само един панел", () => {
    render(wrap(<MobileProductSwitcher source="home" />));
    expect(DEFAULT_MOBILE_PRODUCT).toBe("contract_check");
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAttribute("data-product-id", "contract_check");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("панелът води с два най-силни резултата, а останалите са в „Какво получавам“", async () => {
    render(wrap(<MobileProductSwitcher source="home" />));
    const product = getProduct("contract_check");
    expect(
      screen.getByTestId("mobile-product-outcomes").querySelectorAll("li"),
    ).toHaveLength(2);
    expect(screen.getByText(product.outcomes[0])).toBeInTheDocument();
    const details = screen.getByTestId("mobile-product-details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Какво получавам");
    expect(details).toHaveTextContent(ONE_TIME_TERMS);
    expect(
      screen.getByRole("link", { name: new RegExp(product.ctaLabel) }),
    ).toHaveAttribute("href", product.ctaHref);
  });

  it("отварянето на подробностите е дедупликирано по източник и продукт", async () => {
    render(wrap(<MobileProductSwitcher source="home" />));
    const summary = screen.getByText("Какво получавам");
    await userEvent.click(summary);
    const calls = vi.mocked(trackFunnelEvent).mock.calls.filter(
      (c) => c[0] === "product_details_opened",
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][2]).toEqual(
      expect.objectContaining({ dedupKey: "home|contract_check" }),
    );
  });

  it("смяната на опция сменя панела, цените са винаги видими", async () => {
    render(wrap(<MobileProductSwitcher source="home" />));
    for (const id of ["contract_check", "contract_improve", "business_contract_map"] as const) {
      expect(screen.getAllByText(productPriceLabel(id)).length).toBeGreaterThan(0);
    }
    await userEvent.click(screen.getByRole("tab", { name: /Бизнес карта/ }));
    expect(screen.getByTestId("mobile-product-panel")).toHaveAttribute(
      "data-product-id",
      "business_contract_map",
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      "product_selected",
      expect.objectContaining({ product: "business_contract_map", interaction: "tab" }),
    );
  });
});

describe("мобилен начален екран и граф на модулите", () => {
  const index = read("src/pages/Index.tsx");
  const desktop = read("src/components/home/DesktopHome.tsx");
  const mobileBranch = index.slice(index.indexOf('data-home-variant="mobile"'), index.indexOf("<DesktopHome"));

  it("съдържа само кратката композиция", () => {
    for (const c of ["MobileHero", "MobileTrustRow", "ProductsSection", "MobileEssentials", "MobileFinalCta", "SeoFooter"]) {
      expect(mobileBranch).toContain(c);
    }
  });

  it("десктоп-only модулите не са в мобилния граф на входа", () => {
    for (const m of [
      "@/components/Hero",
      "@/components/home/PrimaryChoice",
      "@/components/SectionBackdrop",
      "@/components/LazyOnVisible",
      "@/data/featuredBlanks",
      "@/lib/templateIndex",
    ]) {
      expect(index).not.toContain(m);
    }
    // Десктоп композицията се внася само лениво.
    expect(index).toMatch(/lazy\(\(\) => import\("@\/components\/home\/DesktopHome"\)/);
  });

  it("десктоп поредицата остава пълна в отделния модул", () => {
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
      expect(desktop).toContain(c);
    }
  });

  it("на телефон не се пуска prefetch на каталога, нито каталожният индекс", () => {
    expect(index).toMatch(/if \(isMobile\) return;\s*\n\s*return prefetchOnIdle/);
    expect(index).toContain("if (isMobile || !shouldPrefetch()) return;");
  });

  it("базовото SEO остава вярно — FAQ винаги, ItemList само когато е наличен", () => {
    expect(index).toContain("buildFaqJsonLd()");
    expect(index).toContain("itemList ? [itemList, buildFaqJsonLd()] : [buildFaqJsonLd()]");
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

describe("мобилен хедър", () => {
  const header = read("src/components/Header.tsx");

  it("има стабилна височина 58px на телефон, без промяна на десктоп", () => {
    expect(header).toContain('h-[58px] lg:h-14');
    expect(header).toContain('h-[58px] lg:h-16');
    expect(header).not.toContain("h-[68px]");
    expect(header).toContain("max-h-[calc(100dvh-58px)]");
  });

  it("не повтаря Профил и дава един път изход/вход", () => {
    const menu = header.slice(header.indexOf('aria-label="Мобилна навигация"'));
    expect(menu).not.toContain("Моят профил");
    expect(menu).not.toContain("Регистрация — без карта");
    expect((menu.match(/Изход/g) ?? []).length).toBe(1);
  });
});

describe("увереност и ясен резултат", () => {
  const hero = read("src/components/home/MobileHero.tsx");

  it("мобилното hero води с резултат, цена и едно действие", () => {
    expect(hero).toContain("Вашият договор.");
    expect(hero).toContain("Проверен. Поправен.");
    expect(hero).toContain("lowestOneTimePriceLabel()");
    expect(hero).toContain("еднократно");
    expect(hero).toContain("Изберете резултат");
    expect(hero).toContain("Изготви нов договор");
  });

  it("не обещава измерено време, адвокатски преглед или безопасност за подпис", () => {
    for (const bad of ["минут", "секунд", "адвокат", "безопасно за подпис"]) {
      expect(hero.toLowerCase()).not.toContain(bad);
    }
  });

  it("акцентът е code-native и уважава reduced motion", () => {
    expect(hero).toContain("motion-safe:animate-scan-line");
    expect(hero).not.toMatch(/<img|<video/);
  });

  it("предпочитаният продукт получава контролирано подчертаване на десктоп", () => {
    const card = read("src/components/products/ProductCard.tsx");
    expect(card).toContain("isFeaturedProduct");
    expect(card).toContain('data-featured');
    expect(card).toContain("border-2 border-gold/45");
    expect(card).not.toMatch(/scale-1[1-9]/);
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
