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

const PREPARED = {
  uploadedContractId: "uc1",
  title: "Договор",
  source: "docx" as const,
  textLength: 5000,
  charUnit: "codepoints" as const,
  sourceHash: "h1",
  originalFilename: "Договор.docx",
  extractionStatus: "full" as const,
  pageCount: 3,
  preview: "Настоящият договор се сключва",
};

/** Качва файл и минава стъпка „Документ“. */
async function completeDocument() {
  const input = document.getElementById("product-file") as HTMLInputElement;
  await userEvent.upload(input, makeFile("Договор.docx"));
  await userEvent.click(screen.getByRole("button", { name: /^Продължете$/ }));
  await waitFor(() => expect(screen.getByTestId("step-summary-document")).toBeInTheDocument());
}

describe("избор на файл", () => {
  it("показва български избор на файл със скрит input", async () => {
    renderPage();
    const zone = await screen.findByTestId("product-file-dropzone");
    expect(zone.textContent).toMatch(/Изберете файл от устройството/);
    expect(zone.textContent).toMatch(/PDF|DOCX/);
    const input = document.getElementById("product-file") as HTMLInputElement;
    expect(input.className).toContain("sr-only");
    expect(zone.getAttribute("for")).toBe("product-file");
    expect(input.getAttribute("aria-label")).toBeTruthy();
  });

  it("дългото име се показва в капсула без преливане и input-ът има име", async () => {
    renderPage();
    const input = document.getElementById("product-file") as HTMLInputElement;
    await userEvent.upload(input, makeFile());
    const name = await screen.findByTestId("product-file-name");
    expect(name.textContent).toBe(LONG_NAME);
    expect(name.className).toContain("truncate");
    expect(screen.getByRole("button", { name: "Смени" })).toBeInTheDocument();
    const selected = document.getElementById("product-file") as HTMLInputElement;
    expect(selected.getAttribute("aria-label")).toBe("Изберете друг файл");
  });
});

describe("една отворена стъпка", () => {
  it("докато документът не е готов, стъпка 3 няма съгласия, но цената се вижда", async () => {
    renderPage();
    await screen.findByTestId("product-file-dropzone");
    expect(document.querySelectorAll('[role="checkbox"]').length).toBe(0);
    expect(screen.queryByText(/Общите условия/)).toBeNull();
    const price = screen.getByTestId("product-price-summary");
    expect(price.textContent).toMatch(/еднократно/i);
    expect(price.textContent).toMatch(/2,99|2\.99/);
    // Стъпка 2 е компактен заключен ред без бутон „Промени“.
    const ctx = screen.getByTestId("step-summary-context");
    expect(ctx.textContent).toMatch(/Вашата страна/);
    expect(ctx.textContent).toMatch(/След документа/);
    expect(ctx.querySelector("button")).toBeNull();
  });

  it("след документа се отваря само контекстът", async () => {
    prepareMock.mockResolvedValue(PREPARED);
    renderPage();
    await completeDocument();
    expect(screen.queryByTestId("product-file-dropzone")).toBeNull();
    expect(screen.queryByTestId("product-file-capsule")).toBeNull();
    expect(screen.getByTestId("step-summary-document").textContent).toMatch(/Договор\.docx/);
    expect(
      screen.getByRole("button", { name: /Коя страна сте|Промени/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Коя страна сте по документа/)).toBeInTheDocument();
    expect(document.querySelectorAll('[role="checkbox"]').length).toBe(0);
  });

  it("след валиден контекст стъпката се свива и се отварят съгласията", async () => {
    prepareMock.mockResolvedValue(PREPARED);
    renderPage();
    await completeDocument();
    await userEvent.type(screen.getByLabelText(/Коя страна сте по документа/), "наемател");
    await userEvent.click(screen.getByRole("button", { name: /^Продължете$/ }));

    await waitFor(() =>
      expect(screen.getByTestId("step-summary-context")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Коя страна сте по документа/)).toBeNull();
    expect(screen.getByTestId("step-summary-context").textContent).toMatch(/наемател/);
    expect(document.querySelectorAll('[role="checkbox"]').length).toBe(4);
    expect(screen.getByRole("button", { name: /Към плащане/ })).toBeInTheDocument();
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
