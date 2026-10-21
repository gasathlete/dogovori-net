import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ invoke: vi.fn(), offer: vi.fn() }));
vi.mock("@/lib/invokeEdgeFunction", () => ({ invokeEdgeFunction: mocked.invoke }));
vi.mock("@/lib/marketingBonus", async (original) => ({ ...await original<object>(), offerMarketingBonus: mocked.offer }));
vi.mock("@/lib/prelaunch", () => ({ canStartNewProcessing: () => true }));
vi.mock("@/lib/opSession", () => ({ getOpSessionId: () => "stable-session" }));
import { generateContractJob } from "@/lib/generateContractJob";
const response = (data: unknown) => ({ data, error: null, correlationId: "cid" });
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe("asynchronous generation bonus recovery", () => {
  it("restarts only a quota-denied job with identical payload/key, never completed work", async () => {
    mocked.offer.mockResolvedValue(true);
    mocked.invoke.mockResolvedValueOnce(response({ job_id: "j1" }))
      .mockResolvedValueOnce(response({ status: "error", http_status: 402, code: "quota_exceeded", result: { code: "quota_exceeded" } }))
      .mockResolvedValueOnce(response({ job_id: "j2" }))
      .mockResolvedValueOnce(response({ status: "done", result: { text: "complete" } }));
    const payload = { text: "preserved document input" };
    const pending = generateContractJob(payload, { idempotencyKey: "same-key" });
    await vi.runAllTimersAsync();
    expect((await pending).data).toEqual({ text: "complete" });
    const starts = mocked.invoke.mock.calls.filter(([, options]) => options.body.action === "start");
    expect(starts).toHaveLength(2);
    expect(starts[0][1].body).toEqual(starts[1][1].body);
    expect(starts[1][1].body.payload).toBe(payload);
    expect(mocked.offer).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("dismiss or non-quota failure never repeats work (%s)", async (nonQuota) => {
    mocked.offer.mockResolvedValue(false);
    mocked.invoke.mockResolvedValueOnce(response({ job_id: "j1" }))
      .mockResolvedValueOnce(response({ status: "error", http_status: 402, code: nonQuota ? "product_payment_required" : "quota_exceeded", result: { code: nonQuota ? "product_payment_required" : "quota_exceeded" } }));
    const pending = generateContractJob({ text: "original" }, { idempotencyKey: "same-key" });
    await vi.runAllTimersAsync(); await pending;
    expect(mocked.invoke.mock.calls.filter(([, options]) => options.body.action === "start")).toHaveLength(1);
    expect(mocked.offer).toHaveBeenCalledTimes(nonQuota ? 0 : 1);
  });
});