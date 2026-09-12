/**
 * Екранът за купуване на телефон: български избор на файл, капсула с дълго име,
 * свити стъпки и стабилно поведение, когато записът още не е възможен.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prepareMock, toastError, toastSuccess } = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" }, loading: false }),
}));
vi.mock("@/components/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/lib/stripe", () => ({ getStripeEnvironment: () => "sandbox" }));
vi.mock("@/components/StripeEmbeddedCheckout", () => ({
  StripeEmbeddedCheckout: () => <div data-testid="stripe-mounted" />,
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/productUpload", async () => {
  const actual = await vi.importActual<typeof import("@/lib/productUpload")>(
    "@/lib/productUpload",
  );
  return { ...actual, prepareProductDocument: prepareMock };
});

import ProductCheckout from "@/pages/ProductCheckout";
import {
  PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE,
  ProductUploadError,
} from "@/lib/productUpload";

const LONG_NAME =
  "Договор за наем на офис с много дълго и подробно име на файла версия 7 финална.docx";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}>
      <Routes>
        <Route path="/produkti/:slug/start" element={<ProductCheckout />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeFile(name = LONG_NAME) {
  return new File(["съдържание"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

beforeEach(() => {
  prepareMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("избор на файл", () => {
  it("показва български избор на файл със скрит input", async () => {
    renderPage();
    const zone = await screen.findByTestId("product-file-dropzone");
    expect(zone.textContent).toMatch(/Изберете файл от устройството/);
    expect(zone.textContent).toMatch(/PDF|DOCX/);
    const input = document.getElementById("product-file") as HTMLInputElement;
    expect(input.className).toContain("sr-only");
    expect(zone.getAttribute("for")).toBe("product-file");
  });

  it("дългото име се показва в капсула без преливане", async () => {
    renderPage();
    const input = document.getElementById("product-file") as HTMLInputElement;
    await userEvent.upload(input, makeFile());
    const name = await screen.findByTestId("product-file-name");
    expect(name.textContent).toBe(LONG_NAME);
    expect(name.className).toContain("truncate");
    expect(screen.getByRole("button", { name: "Смени" })).toBeInTheDocument();
  });
});

describe("грешка при запис", () => {
  it("не показва сурово съобщение, страницата остава на стъпка Документ и CTA се възстановява", async () => {
    prepareMock.mockRejectedValue(
      new ProductUploadError(PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE),
    );
    renderPage();
    const input = document.getElementById("product-file") as HTMLInputElement;
    await userEvent.upload(input, makeFile("Договор.docx"));
    await userEvent.click(screen.getByRole("button", { name: /Продължете/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const shown = String(toastError.mock.calls[0][0]);
    expect(shown).toBe(PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE);
    for (const banned of ["product_extracted_chars", "uploaded_contracts", "schema cache"]) {
      expect(shown).not.toContain(banned);
    }
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stripe-mounted")).toBeNull();

    // Файлът може да бъде избран отново и бутонът работи пак.
    expect(screen.getByTestId("product-file-capsule")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: /Продължете/ });
    expect(cta).not.toBeDisabled();
    expect(
      screen.getByTestId("checkout-step-document").getAttribute("aria-current"),
    ).toBe("step");
  });
});

describe("свити стъпки", () => {
  it("след прочитане на документа стъпката е тънко резюме", async () => {
    prepareMock.mockResolvedValue({
      uploadedContractId: "uc1",
      title: "Договор",
      source: "docx",
      textLength: 5000,
      charUnit: "codepoints",
      sourceHash: "h1",
      originalFilename: "Договор.docx",
      extractionStatus: "full",
      pageCount: 3,
      preview: "Настоящият договор се сключва",
    });
    renderPage();
    const input = document.getElementById("product-file") as HTMLInputElement;
    await userEvent.upload(input, makeFile("Договор.docx"));
    await userEvent.click(screen.getByRole("button", { name: /Продължете/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Смени документа/ })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("product-file-dropzone")).toBeNull();
    expect(screen.getByTestId("product-price-summary").textContent).toMatch(
      /еднократно, без абонамент/i,
    );
  });
});
