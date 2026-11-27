import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { refreshSession: mocks.refresh, getSession: vi.fn() },
  functions: { invoke: mocks.invoke },
} }));
import { prepareProductText } from "@/lib/productUpload";
const input = { userId: "owner-a", id: "50a3986e-13cc-4cb3-9a0a-1d76a25673f4", title: "Синтетичен документ", text: "Синтетичен текст без лични данни. ".repeat(5) };
beforeEach(() => {
  mocks.refresh.mockReset().mockResolvedValue({ data: { session: { user: { id: "owner-a" }, access_token: "captured-token" } } });
  mocks.invoke.mockReset().mockResolvedValue({ data: { contract: { id: input.id, text_hash: "server-hash" } }, error: null });
});
describe("paid text intake ownership and retry", () => {
  it("pins the accepted session token and reuses the same document id for exact retry", async () => {
    await prepareProductText(input);
    await prepareProductText(input);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    for (const call of mocks.invoke.mock.calls) {
      expect(call[0]).toBe("uploaded-text-intake");
      expect(call[1]).toMatchObject({ headers: { Authorization: "Bearer captured-token" }, body: { id: input.id, product_source: true } });
      expect(call[1].body).not.toHaveProperty("user_id");
      expect(call[1].body).not.toHaveProperty("access_token");
    }
  });
  it("refuses to transmit the old owner's text when refresh resolves to another account", async () => {
    mocks.refresh.mockResolvedValue({ data: { session: { user: { id: "owner-b" }, access_token: "other-token" } } });
    await expect(prepareProductText(input)).rejects.toThrow(/Сесията се промени/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
