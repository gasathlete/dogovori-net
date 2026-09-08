import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles } from "@/icons";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import {
  setAssistantDocumentContext,
  type AssistantContextKind,
} from "@/lib/assistantDocumentContext";

/**
 * Q2e — „Попитай DogovaryAI“ за текущия документ в Workspace.
 *
 * Предава САМО метаданни (вид, ID и UI етикет). Никакъв текст, payload или
 * съдържание на анализ не влиза в състоянието, URL адреса или заявката.
 * Редактируем панел с незапазени промени отказва избора и обяснява защо.
 */
export function AskDogovaryAIButton({
  kind,
  entityId,
  displayTitle,
  tabId,
}: {
  kind: AssistantContextKind;
  entityId: string;
  displayTitle: string;
  /** Ако е подаден, незапазените промени по този таб блокират избора. */
  tabId?: string;
}) {
  const navigate = useNavigate();
  const { state, setSection } = useConsoleStore();
  const isDirty = tabId ? !!state.tabs.find((t) => t.id === tabId)?.dirty : false;

  const handleClick = () => {
    if (isDirty) {
      toast.error("Запазете промените първо", {
        description: "DogovaryAI работи по запазената версия на документа.",
      });
      return;
    }
    const ctx = setAssistantDocumentContext({ kind, entityId, displayTitle });
    if (!ctx) {
      toast.error("Документът не може да бъде избран за разговор.");
      return;
    }
    setSection("assistant");
    navigate("/console/assistant");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="ask-dogovaryai"
      className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
    >
      <Sparkles className="h-4 w-4" /> Попитай DogovaryAI
    </button>
  );
}
