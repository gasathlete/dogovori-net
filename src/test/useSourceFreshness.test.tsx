import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSourceFreshness } from "@/hooks/useSourceFreshness";
import { computeSavedSnapshotBinding, type AnalysisSourceBinding } from "@/lib/analysisSourceBinding";

const evidence = (source?: AnalysisSourceBinding) => ({
  version: 1,
  status: "evidence_checked",
  reason_codes: [],
  counts: {
    issues_raw: 0, issues_kept: 0, issues_rejected: 0,
    missing_raw: 0, missing_kept: 0, missing_rejected: 0,
  },
  score_trusted: true,
  ...(source ? { source } : {}),
});

const TEXT_A = "Договор А. ".repeat(20);
const TEXT_B = "Договор Б. ".repeat(20);

describe("useSourceFreshness", () => {
  it("потвърждава актуалност само за точния запазен текст и име", async () => {
    const binding = await computeSavedSnapshotBinding({ savedText: TEXT_A, savedTitle: "Наем" });
    const { result } = renderHook(() =>
      useSourceFreshness({
        userId: "u1", docId: "d1", savedText: TEXT_A, savedTitle: "Наем",
        verification: evidence(binding), hasUnsavedChanges: false,
      }),
    );
    expect(result.current.freshness).toBe("checking");
    await waitFor(() => expect(result.current.freshness).toBe("current"));
    expect(result.current.currentBinding).toEqual(binding);
  });

  it("смяна на текста веднага отнема актуалността (никога не certifies нов текст)", async () => {
    const bindingA = await computeSavedSnapshotBinding({ savedText: TEXT_A, savedTitle: "Наем" });
    const { result, rerender } = renderHook(
      (props: { text: string }) =>
        useSourceFreshness({
          userId: "u1", docId: "d1", savedText: props.text, savedTitle: "Наем",
          verification: evidence(bindingA), hasUnsavedChanges: false,
        }),
      { initialProps: { text: TEXT_A } },
    );
    await waitFor(() => expect(result.current.freshness).toBe("current"));

    await act(async () => {
      rerender({ text: TEXT_B });
    });
    // Дори за един рендер старият дайджест не важи за новия текст.
    expect(["checking", "stale"]).toContain(result.current.freshness);
    await waitFor(() => expect(result.current.freshness).toBe("stale"));
  });

  it("резултат за документ А не удостоверява документ Б", async () => {
    const bindingA = await computeSavedSnapshotBinding({ savedText: TEXT_A, savedTitle: "Наем" });
    const { result, rerender } = renderHook(
      (props: { docId: string; text: string }) =>
        useSourceFreshness({
          userId: "u1", docId: props.docId, savedText: props.text, savedTitle: "Наем",
          verification: evidence(bindingA), hasUnsavedChanges: false,
        }),
      { initialProps: { docId: "d1", text: TEXT_A } },
    );
    await waitFor(() => expect(result.current.freshness).toBe("current"));
    await act(async () => {
      rerender({ docId: "d2", text: TEXT_B });
    });
    await waitFor(() => expect(result.current.freshness).toBe("stale"));
    expect(result.current.freshness).not.toBe("current");
  });

  it("изход от профила спира всяко твърдение за актуалност", async () => {
    const binding = await computeSavedSnapshotBinding({ savedText: TEXT_A, savedTitle: "Наем" });
    const { result, rerender } = renderHook(
      (props: { userId: string | null }) =>
        useSourceFreshness({
          userId: props.userId, docId: "d1", savedText: TEXT_A, savedTitle: "Наем",
          verification: evidence(binding), hasUnsavedChanges: false,
        }),
      { initialProps: { userId: "u1" as string | null } },
    );
    await waitFor(() => expect(result.current.freshness).toBe("current"));
    await act(async () => {
      rerender({ userId: null });
    });
    expect(result.current.freshness).toBe("checking");
    expect(result.current.currentBinding).toBeNull();
  });

  it("незапазени промени изпреварват всичко останало", async () => {
    const binding = await computeSavedSnapshotBinding({ savedText: TEXT_A, savedTitle: "Наем" });
    const { result } = renderHook(() =>
      useSourceFreshness({
        userId: "u1", docId: "d1", savedText: TEXT_A, savedTitle: "Наем",
        verification: evidence(binding), hasUnsavedChanges: true,
      }),
    );
    await waitFor(() => expect(result.current.currentBinding).not.toBeNull());
    expect(result.current.freshness).toBe("unsaved");
  });
});
