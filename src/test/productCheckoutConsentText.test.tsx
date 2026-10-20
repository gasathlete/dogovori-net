import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), invoke: vi.fn(),
  auth: { user: { id: "owner-a", email: "fixture@example.invalid" } },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...mocks.auth, loading: false }) }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/StripeEmbeddedCheckout", () => ({ StripeEmbeddedCheckout: () => <div data-testid="test-stripe" /> }));
vi.mock("@/lib/stripe", () => ({ getStripeEnvironment: () => "sandbox" }));
vi.mock("@/lib/products", async (orig) => ({ ...(await orig<typeof import("@/lib/products")>()), ONE_TIME_PURCHASES_AVAILABLE: true }));
vi.mock("@/lib/privacyGate", async (orig) => ({ ...(await orig<typeof import("@/lib/privacyGate")>()), RAW_FILE_INGRESS_ALLOWED: false }));
vi.mock("@/lib/productUpload", () => ({
  ProductUploadError: class extends Error {}, PRODUCT_PERSIST_FAILED_MESSAGE: "Неуспешен запис",
  prepareProductText: mocks.prepare, prepareProductDocument: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: mocks.auth.user, access_token: "synthetic-token" } } }) },
  functions: { invoke: mocks.invoke },
} }));
import ProductCheckout from "@/pages/ProductCheckout";
const prepared = { uploadedContractId: "synthetic-document", title: "Тестов текст", source: "owner_text",
  textLength: 120, charUnit: "unicode_code_points", sourceHash: "synthetic-hash", extractionStatus: "full", preview: "Тестов текст" };
function Harness() {
  return <MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}>
    <Routes><Route path="/produkti/:slug/start" element={<ProductCheckout />} /></Routes>
  </MemoryRouter>;
}
beforeEach(() => {
  mocks.auth.user = { id: "owner-a", email: "fixture@example.invalid" };
  mocks.prepare.mockReset().mockResolvedValue(prepared);
  mocks.invoke.mockReset().mockResolvedValue({ data: { clientSecret: "synthetic-checkout" }, error: null });
});
afterEach(cleanup);
async function pasteDocument() {
  fireEvent.change(screen.getByLabelText("Пълен текст на документа"), { target: { value: "Синтетичен текст за проверка. ".repeat(5) } });
  await userEvent.click(screen.getByRole("button", { name: /^Продължете$/ }));
}
it("requires four independent unchecked confirmations and sends their actual values", async () => {
  render(<Harness />);
  await pasteDocument();
  fireEvent.change(await screen.findByLabelText(/Коя страна сте по документа/), { target: { value: "наемател" } });
  await userEvent.click(screen.getByRole("button", { name: /^Продължете$/ }));
  const boxes = screen.getAllByRole("checkbox");
  const pay = screen.getByRole("button", { name: /Към плащане/ });
  expect(boxes).toHaveLength(4);
  for (const box of boxes) expect(box).toHaveAttribute("data-state", "unchecked");
  for (const box of boxes.slice(0, 3)) await userEvent.click(box);
  expect(pay).toBeDisabled();
  expect(mocks.invoke).not.toHaveBeenCalled();
  await userEvent.click(boxes[3]);
  expect(pay).toBeEnabled();
  await userEvent.click(boxes[1]);
  expect(pay).toBeDisabled();
  await userEvent.click(boxes[1]);
  await userEvent.click(pay);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  expect(mocks.invoke.mock.calls[0][1]).toMatchObject({
    headers: { Authorization: "Bearer synthetic-token" },
    body: { termsAccepted: true, aiAckAccepted: true, immediatePerformanceConsent: true, withdrawalLossAcknowledged: true },
  });
});
it("does not expose the old prepared document after an account changes during save", async () => {
  let finish!: (value: typeof prepared) => void;
  mocks.prepare.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<Harness />);
  await pasteDocument();
  mocks.auth.user = { id: "owner-b", email: "other-fixture@example.invalid" };
  view.rerender(<Harness />);
  finish(prepared);
  await waitFor(() => expect(screen.getByLabelText("Пълен текст на документа")).toHaveValue(""));
  expect(screen.queryByLabelText(/Коя страна сте по документа/)).not.toBeInTheDocument();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
