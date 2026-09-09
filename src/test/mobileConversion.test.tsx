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
    const panel = screen.getByTestId("mobile-product-panel");
    expect(panel.querySelectorAll("ul > li")).toHaveLength(2);
    expect(screen.getByText(product.outcomes[0])).toBeInTheDocument();
    const details = screen.getByTestId("mobile-product-details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Какво получавам");
    expect(details).toHaveTextContent(ONE_TIME_TERMS);
    expect(
      screen.getByRole("link", { name: new RegExp(product.ctaLabel) }),
    ).toHaveAttribute("href", product.ctaHref);
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

describe("мобилен начален екран", () => {
  const index = read("src/pages/Index.tsx");
  const mobileBranch = index.slice(index.indexOf('data-home-variant="mobile"'), index.indexOf('data-home-variant="desktop"'));

  it("съдържа само кратката композиция", () => {
    for (const c of ["MobileHero", "MobileTrustRow", "ProductsSection", "MobileEssentials", "MobileFinalCta", "SeoFooter"]) {
      expect(mobileBranch).toContain(c);
    }
  });

  it("не рендира дългата десктоп поредица на телефон", () => {
    for (const c of [
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
      "<FAQ",
      "CTABand",
    ]) {
      expect(mobileBranch).not.toContain(c);
    }
  });

  it("десктоп поредицата остава непокътната", () => {
    const desktop = index.slice(index.indexOf('data-home-variant="desktop"'));
    for (const c of ["Hero", "SocialProofStrip", "ProductsSection", "PrimaryChoice", "FAQ", "CTABand"]) {
      expect(desktop).toContain(c);
    }
  });
});

describe("мобилни наслоявания и профил", () => {
  const app = read("src/App.tsx");
  const mobileOverlays = app.slice(app.indexOf("if (isMobile) {"), app.indexOf("  return (\n    <Suspense fallback={null}>"));

  it("на телефон не се монтират плаващи помощници и попъпи", () => {
    for (const c of [
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

  it("остават безопасността, плащането и долната навигация", () => {
    for (const c of ["PaymentTestModeBanner", "CookieBanner", "BetaDisclaimerModal", "MobileBottomNav"]) {
      expect(mobileOverlays).toContain(c);
    }
  });

  it("профилът води с документите на телефон, но явният таб печели", () => {
    const account = read("src/pages/Account.tsx");
    const init = account.slice(account.indexOf("const initialTab ="), account.indexOf("const initialTab =") + 260);
    expect(init.indexOf('params.get("tab")')).toBeLessThan(init.indexOf("isMobileViewport"));
    expect(init).toContain('"documents"');
    expect(init).toContain('"dashboard"');
    const groups = account.slice(account.indexOf("const MOBILE_TAB_GROUPS"));
    const body = groups.slice(0, groups.indexOf("\n];"));
    expect(body.indexOf('"documents"')).toBeLessThan(body.indexOf('"dashboard"'));
    expect(body.indexOf('"dashboard"')).toBeLessThan(body.indexOf('"subscription"'));
    expect(body.indexOf('"subscription"')).toBeLessThan(body.indexOf('id: "more"'));
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
