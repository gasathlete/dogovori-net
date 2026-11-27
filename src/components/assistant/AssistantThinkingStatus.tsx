import { useEffect, useState } from "react";
import type { ToolEvent } from "./AssistantToolCard";

/**
 * Lovable-style rotating "what is the AI doing right now" indicator.
 * - If a tool call is in flight, shows a phrase specific to that tool.
 * - Otherwise cycles through generic phases every ~2.2s.
 * - Shimmer effect on the text so it feels alive without being busy.
 */

const GENERIC_PHRASES = [
  "Обмислям въпроса",
  "Събирам данни",
  "Проверявам източници",
  "Съпоставям практика",
  "Оформям отговора",
];

const TOOL_PHRASES: Record<string, string> = {
  search_templates: "Търся подходящи шаблони",
  legal_search: "Проверявам законови текстове",
  legal_rag: "Чета правни източници",
  ask_clarification: "Формулирам уточняващи въпроси",
  propose_contract_outline: "Скицирам структурата на документа",
  navigate: "Подготвям навигация",
  open_template: "Отварям шаблон",
  open_upload_analyzer: "Подготвям анализатор",
  prefill_build_contract: "Попълвам wizard-а",
  web_search: "Търся в мрежата",
};

function phraseForTool(name?: string): string | null {
  if (!name) return null;
  return TOOL_PHRASES[name] ?? "Изпълнявам инструмент";
}

interface Props {
  toolEvents?: ToolEvent[];
  compact?: boolean;
}

export function AssistantThinkingStatus({ toolEvents, compact }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % GENERIC_PHRASES.length), 2200);
    return () => clearInterval(t);
  }, []);

  // Prefer the latest pending tool call as the active status.
  const lastTool = toolEvents && toolEvents.length > 0 ? toolEvents[toolEvents.length - 1] : null;
  const toolPhrase = lastTool?.kind === "tool_call" ? phraseForTool(lastTool.name) : null;
  const phrase = toolPhrase ?? GENERIC_PHRASES[idx];

  return (
    <div
      className={
        compact
          ? "inline-flex items-center gap-2 py-1.5"
          : "inline-flex items-center gap-2 py-2"
      }
      aria-live="polite"
    >
      <span
        className="relative inline-block h-2 w-2 rounded-full bg-gold"
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full bg-gold/60 animate-ping" />
      </span>
      <span
        key={phrase}
        className="thinking-shimmer text-xs font-medium tracking-tight"
      >
        {phrase}…
      </span>
    </div>
  );
}
