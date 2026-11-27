/**
 * Shared in-memory store linking `ask_clarification` → `propose_contract_outline`
 * → Live Draft preview → `/build` prefill. Components subscribe via
 * `useAssistantDraft()` and update via `updateAssistantDraft(...)`.
 *
 * Scope: one draft per browser tab/session. The user works on one document at
 * a time inside the assistant; if they switch threads, the draft is reset
 * explicitly by the AssistantChat component.
 */
import { useSyncExternalStore } from "react";

export interface DraftAnswer {
  /** Question label shown to the user (e.g. "Брутна заплата"). */
  label: string;
  /** Stored value, always serialized to string for display. */
  value: string;
}

export interface DraftClause {
  heading: string;
  summary: string;
}

export interface AssistantDraft {
  title: string | null;
  documentType: string | null;
  basedOnTemplateSlug: string | null;
  partiesA: string | null;
  partiesB: string | null;
  subject: string | null;
  bilingual: boolean;
  clauses: DraftClause[];
  /** Map of clarification question id → answer. */
  answers: Record<string, DraftAnswer>;
  updatedAt: number;
}

const EMPTY: AssistantDraft = {
  title: null,
  documentType: null,
  basedOnTemplateSlug: null,
  partiesA: null,
  partiesB: null,
  subject: null,
  bilingual: false,
  clauses: [],
  answers: {},
  updatedAt: 0,
};

let current: AssistantDraft = { ...EMPTY };
const listeners = new Set<() => void>();

function emit() {
  current = { ...current, updatedAt: Date.now() };
  for (const l of listeners) l();
}

export function getAssistantDraft(): AssistantDraft {
  return current;
}

export function updateAssistantDraft(patch: Partial<AssistantDraft>) {
  current = { ...current, ...patch };
  emit();
}

export function mergeAssistantAnswers(answers: Record<string, DraftAnswer>) {
  current = { ...current, answers: { ...current.answers, ...answers } };
  emit();
}

export function resetAssistantDraft() {
  current = { ...EMPTY };
  emit();
}

export function useAssistantDraft(): AssistantDraft {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

/**
 * Build query params for /build prefill from current draft + an optional
 * outline.prefill override.
 */
export function buildPrefillParams(
  override?: Partial<{
    name: string;
    documentType: string;
    partiesA: string;
    partiesB: string;
    subject: string;
    bilingual: boolean;
  }>,
): URLSearchParams {
  const d = current;
  const merged = {
    name: override?.name ?? d.title ?? undefined,
    documentType: override?.documentType ?? d.documentType ?? undefined,
    partiesA: override?.partiesA ?? d.partiesA ?? undefined,
    partiesB: override?.partiesB ?? d.partiesB ?? undefined,
    subject: override?.subject ?? d.subject ?? undefined,
    bilingual: override?.bilingual ?? d.bilingual,
  };
  // Heuristic: try to extract typical party/subject info from answers if
  // outline didn't include them explicitly.
  for (const [k, a] of Object.entries(d.answers)) {
    if (!a.value) continue;
    if (!merged.partiesA && /^(strana_a|party_a|naemodatel|rabotodatel|vazlojitel|podatel|prodavach|davam|izpalnitel_a)/i.test(k))
      merged.partiesA = a.value;
    if (!merged.partiesB && /^(strana_b|party_b|naemate?l|rabotnik|izpalnitel|adresat|kupuvach)/i.test(k))
      merged.partiesB = a.value;
    if (!merged.subject && /(predmet|subject|description|opisanie|imot|dlazhnost|usluga)/i.test(k))
      merged.subject = a.value;
  }

  const params = new URLSearchParams();
  if (merged.documentType) params.set("documentType", merged.documentType);
  if (merged.name) params.set("name", merged.name);
  if (merged.partiesA) params.set("partiesA", merged.partiesA);
  if (merged.partiesB) params.set("partiesB", merged.partiesB);
  if (merged.subject) params.set("subject", merged.subject);
  if (merged.bilingual) params.set("bilingual", "1");
  // Forward all clarification answers as `q.<id>` so the wizard can map them.
  for (const [k, a] of Object.entries(d.answers)) {
    if (a.value) params.set(`q.${k}`, a.value);
  }
  params.set("from", "dogovaryai");
  return params;
}
