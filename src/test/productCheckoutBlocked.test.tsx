/**
 * При затворена преграда екранът за купуване не предлага избор на файл, а
 * обяснява защо и какво да направи човекът.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" }, loading: false }),
}));
vi.mock("@/components/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/lib/stripe", () => ({ getStripeEnvironment: () => "sandbox" }));
vi.mock("@/components/StripeEmbeddedCheckout", () => ({
  StripeEmbeddedCheckout: () => <div data-testid="stripe-mounted" />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return { ...actual, ONE_TIME_PURCHASES_AVAILABLE: true };
});

import ProductCheckout from "@/pages/ProductCheckout";
import { RAW_FILE_INGRESS_ALLOWED } from "@/lib/privacyGate";
import { PRODUCT_ACCEPTED_INPUT } from "@/lib/productSource";

describe("купуване при затворена преграда", () => {
  it("показва обяснение вместо избор на файл", () => {
    expect(RAW_FILE_INGRESS_ALLOWED).toBe(false);
    render(
      <MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}>
        <Routes>
          <Route path="/produkti/:slug/start" element={<ProductCheckout />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Пълен текст на документа")).toBeInTheDocument();
    expect(screen.getByTestId("product-paste")).toHaveTextContent(PRODUCT_ACCEPTED_INPUT);
    expect(document.getElementById("product-file")).toBeNull();
  });
});

// Изолирано „отворено“ състояние: тестът проверява самия поток, не предварителния режим.
vi.mock("@/lib/prelaunch", async (orig) => ({
  ...(await orig<typeof import("@/lib/prelaunch")>()),
  canStartNewProcessing: () => true,
}));
