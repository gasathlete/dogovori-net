import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { id: string }, loading: false }));
const avail = vi.hoisted(() => ({ open: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
vi.mock("@/lib/prelaunch", async (orig) => {
  const real = await orig<typeof import("@/lib/prelaunch")>();
  return { ...real, isFeatureAvailable: () => avail.open };
});

import { CatalogReviewNotice } from "@/components/CatalogReviewNotice";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { RegistrationInvite } from "@/components/funnel/RegistrationInvite";
import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";
import { SIGNUP_LABEL } from "@/lib/registrationFunnel";

afterEach(() => { cleanup(); auth.user = null; avail.open = true; });
const src = (p: string) => readFileSync(p, "utf8");

describe("catalog review notice placement", () => {
  it("is one quiet line without a badge", () => {
    render(<CatalogReviewNotice catalog />);
    const el = screen.getByTestId("catalog-review-notice");
    expect(el.tagName).toBe("P");
    expect(el).toHaveTextContent(CATALOG_REVIEW_STATUS.notice);
    expect(screen.queryByText(CATALOG_REVIEW_STATUS.badge)).toBeNull();
  });

  it("is used only at the top of catalog/sector/category and once on the template detail", () => {
    const allowed: Record<string, number> = {
      "src/pages/Catalog.tsx": 1, "src/pages/Category.tsx": 1, "src/pages/Sector.tsx": 1,
      "src/pages/Template.tsx": 1, "src/pages/StaticCatalogStore.tsx": 1,
    };
    for (const [file, n] of Object.entries(allowed)) {
      expect((src(file).match(/<CatalogReviewNotice\b/g) ?? []).length, file).toBe(n);
    }
    for (const file of ["src/components/SeoFooter.tsx", "src/components/Hero.tsx", "src/components/home/PlatformExperience.tsx",
      "src/components/funnel/StoryCapabilityDemo.tsx", "src/components/funnel/StartStoryOverlay.tsx"]) {
      expect(src(file), file).not.toMatch(/CATALOG_REVIEW_STATUS|CatalogReviewNotice/);
    }
  });

  it("test period appears only in the header", () => {
    expect(src("src/components/Hero.tsx")).not.toContain("Тестов период");
    expect(src("src/components/Header.tsx")).toContain("TEST_PERIOD_LABEL");
  });
});

describe("launch purchase banner", () => {
  it("renders nothing while the feature is available", () => {
    render(<LaunchPurchaseBanner feature="one_time_product" />);
    expect(screen.queryByTestId("launch-purchase-banner")).toBeNull();
  });
  it("renders when the feature is closed", () => {
    avail.open = false;
    render(<LaunchPurchaseBanner feature="subscription" />);
    expect(screen.getByTestId("launch-purchase-banner")).toBeInTheDocument();
  });
  it("packages/kits keep the note only on their list pages", () => {
    for (const f of ["src/pages/KitDetail.tsx", "src/pages/SectorPackageDetail.tsx", "src/pages/RentalPreparation.tsx",
      "src/pages/KitChecklistPreparation.tsx", "src/components/LifeScenarios.tsx", "src/components/home/SectorPackages.tsx"]) {
      expect(src(f), f).not.toMatch(/LaunchPurchaseBanner|PackagePurchaseNote/);
    }
    expect(src("src/pages/Kits.tsx")).toContain("<PackagePurchaseNote");
    expect(src("src/pages/SectorPackages.tsx")).toContain("<PackagePurchaseNote");
  });
});

describe("home CTA hierarchy and registration", () => {
  it("uses the polite signup label", () => {
    expect(SIGNUP_LABEL).toBe("Регистрирайте се безплатно");
  });
  it("hero: solid primary „Намерете документ“, visible outlined signup with a benefit line", () => {
    const hero = src("src/components/Hero.tsx");
    expect(hero).toMatch(/className="btn-gold inline-flex min-h-14[^"]*"[\s\S]{0,120}Намерете документ/);
    expect(hero).toMatch(/<RegistrationCTA source="hero"[^>]*variant="outline"/);
    expect(hero).toContain("Безплатен профил – запазвате документите си и продължавате по-късно.");
    expect(hero.indexOf("Намерете документ")).toBeLessThan(hero.indexOf('<RegistrationCTA source="hero"'));
  });
  it("inline invitation shows for guests only", () => {
    const ui = () => <MemoryRouter><RegistrationInvite source="template_detail" text="Полза" /></MemoryRouter>;
    const view = render(ui());
    expect(screen.getByRole("link", { name: SIGNUP_LABEL })).toBeInTheDocument();
    auth.user = { id: "synthetic" };
    view.rerender(ui());
    expect(screen.queryByTestId("registration-invite")).toBeNull();
  });
});
