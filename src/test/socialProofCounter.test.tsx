/**
 * Брояч за регистрирани потребители: точна стойност, честни състояния при
 * зареждане/грешка и коректен count-up при асинхронен target.
 */
import * as React from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
      }),
    }),
  },
}));

import { SocialProofStrip } from "@/components/SocialProofStrip";
import { useCountUp } from "@/hooks/useCountUp";

function renderStrip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SocialProofStrip />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("SocialProofStrip — брой регистрирани потребители", () => {
  it("показва точното число без '+' при валиден резултат", async () => {
    rpcMock.mockResolvedValue({ data: 137, error: null });
    renderStrip();
    await waitFor(() =>
      expect(
        screen.getByLabelText("137 регистрирани потребители"),
      ).toBeTruthy(),
    );
    expect(document.body.textContent).not.toMatch(/137\s*\+/);
  });

  it("показва 0 честно", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });
    renderStrip();
    await waitFor(() =>
      expect(screen.getByLabelText("0 регистрирани потребители")).toBeTruthy(),
    );
  });

  it("не подменя стойност под 100", async () => {
    rpcMock.mockResolvedValue({ data: 7, error: null });
    renderStrip();
    await waitFor(() =>
      expect(screen.getByLabelText("7 регистрирани потребители")).toBeTruthy(),
    );
    expect(document.body.textContent).not.toContain("100");
  });

  it("при RPC грешка скрива само user metric-а и не измисля число", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderStrip();
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "Използвана от фирми, специалисти на свободна практика",
      ),
    );
    expect(screen.queryByText("регистрирани потребители")).toBeNull();
    expect(document.body.textContent).toContain("образеца в каталога");
  });

  it("при невалиден резултат също не показва брой", async () => {
    rpcMock.mockResolvedValue({ data: "не-число", error: null });
    renderStrip();
    await waitFor(() =>
      expect(screen.queryByText("регистрирани потребители")).toBeNull(),
    );
  });

  it("докато зарежда не показва фалшива цифра", async () => {
    rpcMock.mockReturnValue(new Promise(() => {}));
    renderStrip();
    expect(document.body.textContent).not.toContain("100");
    expect(screen.getByText("Зарежда се")).toBeTruthy();
  });
});

describe("useCountUp", () => {
  it("при reduced motion скача директно и следва асинхронна промяна на target", async () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("reduce"),
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as any,
    );

    const { result, rerender } = renderHook(({ t }) => useCountUp(t), {
      initialProps: { t: 0 },
    });
    await act(async () => {});
    expect(result.current.value).toBe(0);

    rerender({ t: 42 });
    await act(async () => {});
    expect(result.current.value).toBe(42);

    rerender({ t: 43 });
    await act(async () => {});
    expect(result.current.value).toBe(43);

    mm.mockRestore();
  });
});
