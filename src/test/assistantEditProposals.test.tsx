import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  proposalTargetLabel,
  proposalStatusLabel,
  proposalErrorMessage,
  SAVED_DOCUMENT_UPDATED_EVENT,
  emitSavedDocumentUpdated,
  submitProposalAction,
  type EditProposal,
} from "@/lib/assistantEditProposals";
import { AssistantEditProposalCard } from "@/components/assistant/AssistantEditProposalCard";

const base: EditProposal = {
  id: "p1",
  threadId: "t1",
  savedDocumentId: "d1",
  targetPath: "payload.sections[1].body",
  before: "стар текст",
  after: "нов текст",
  reason: "по-ясна формулировка",
  status: "pending",
  createdAt: null,
};

describe("proposal labels", () => {
  it("маркира целите на български без техничен път", () => {
    expect(proposalTargetLabel("title")).toBe("Заглавие на документа");
    expect(proposalTargetLabel("payload.intro")).toBe("Уводен текст");
    expect(proposalTargetLabel("payload.closing")).toBe("Заключение");
    expect(proposalTargetLabel("payload.sections[1].body")).toBe("Текст на секция 2");
    expect(proposalTargetLabel("payload.clauses[0].title")).toBe("Заглавие на клауза 1");
    expect(proposalTargetLabel("payload.unknown")).toBe("Елемент от документа");
  });

  it("статусите и грешките са разбираеми", () => {
    expect(proposalStatusLabel("pending")).toContain("решение");
    expect(proposalStatusLabel("reverted")).toContain("Върната");
    expect(proposalErrorMessage("stale_base")).toContain("променен");
    expect(proposalErrorMessage("stale_state")).toContain("върната");
    expect(proposalErrorMessage(undefined)).toContain("Опитайте отново");
  });
});

describe("AssistantEditProposalCard", () => {
  it("показва преди/след и двата бутона при чакащо предложение", () => {
    const onAction = vi.fn();
    render(<AssistantEditProposalCard proposal={base} onAction={onAction} />);
    expect(screen.getByTestId("edit-proposal-card")).toBeInTheDocument();
    expect(screen.getByText("Преди")).toBeInTheDocument();
    expect(screen.getByText("След")).toBeInTheDocument();
    expect(screen.getByText("стар текст")).toBeInTheDocument();
    expect(screen.getByText("нов текст")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Приеми промяната/ }));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: /Откажи/ }));
    expect(onAction).toHaveBeenCalledWith("reject");
  });

  it("докато действието е в ход, бутоните са изключени (без двоен преход)", () => {
    const onAction = vi.fn();
    render(<AssistantEditProposalCard proposal={base} busy onAction={onAction} />);
    const accept = screen.getByRole("button", { name: /Приеми промяната/ });
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("приетото предложение предлага връщане, не повторно приемане", () => {
    render(<AssistantEditProposalCard proposal={{ ...base, status: "accepted" }} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Приеми промяната/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Върни промяната/ })).toBeInTheDocument();
  });

  it("картата е мобилно-безопасна и показва грешка достъпно", () => {
    render(
      <AssistantEditProposalCard proposal={base} error="Документът е променен" onAction={vi.fn()} />,
    );
    const card = screen.getByTestId("edit-proposal-card");
    expect(card.className).toContain("max-w-full");
    expect(card.className).toContain("overflow-hidden");
    expect(screen.getByRole("alert")).toHaveTextContent("Документът е променен");
  });
});

describe("scoped document refresh", () => {
  it("събитието носи само id на един документ", () => {
    const seen: unknown[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(SAVED_DOCUMENT_UPDATED_EVENT, handler);
    emitSavedDocumentUpdated("d1");
    window.removeEventListener(SAVED_DOCUMENT_UPDATED_EVENT, handler);
    expect(seen).toEqual([{ documentId: "d1" }]);
  });
});

describe("submitProposalAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("изпраща bearer auth и връща сървърния отговор", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, action: "accept", changed: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await submitProposalAction("token123", "p1", "accept");
    expect(res).toEqual({ ok: true, action: "accept", changed: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token123");
    expect(JSON.parse(init.body as string)).toEqual({ proposalId: "p1", action: "accept" });
  });

  it("мрежова грешка не се превръща в успех", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await waitFor(async () => {
      const res = await submitProposalAction("t", "p1", "undo");
      expect(res.ok).toBe(false);
      expect(res.code).toBe("network_error");
    });
  });
});
