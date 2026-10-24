import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuthAction } from "@/hooks/useAuthAction";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("auth request ownership", () => {
  it("same-tick double submit performs exactly one request", async () => {
    const { result } = renderHook(useAuthAction);
    let release: (() => void) | undefined;
    const action = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    let first: Promise<void> | undefined;
    act(() => { first = result.current.run(action); void result.current.run(action); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await act(async () => { release?.(); await first; });
    expect(result.current.busy).toBe(false);
  });
  it("network failure releases the lock and permits an explicit retry", async () => {
    const { result } = renderHook(useAuthAction);
    const action = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await act(async () => { await result.current.run(action); });
    expect(result.current.busy).toBe(false);
    await act(async () => { await result.current.run(action); });
    expect(action).toHaveBeenCalledTimes(2);
  });
});