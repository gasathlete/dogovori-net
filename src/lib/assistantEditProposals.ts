/**
 * Q2f — предложения за редакция на запазен документ от DogovaryAI.
 *
 * Клиентът е само четец и „бутон“: чете собствените си предложения през RLS и
 * изпраща решението (приемане/отказ/връщане) към сървърната крайна точка.
 * Никаква част от документа не се записва от браузъра.
 */
import { supabase } from "@/integrations/supabase/client";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "reverted";

export interface EditProposal {
  id: string;
  threadId: string;
  savedDocumentId: string;
  targetPath: string;
  before: string;
  after: string;
  reason: string | null;
  status: ProposalStatus;
  createdAt: string | null;
}

export type ProposalAction = "accept" | "reject" | "undo";

export interface ProposalActionResult {
  ok: boolean;
  code?: string;
  action?: ProposalAction;
  changed?: boolean;
  idempotent?: boolean;
  requiresNewThread?: boolean;
  rebound?: boolean;
  document?: { id: string | null; updatedAt: string | null };
}

/** Събитие за прицелено презареждане на ЕДИН отворен документ. */
export const SAVED_DOCUMENT_UPDATED_EVENT = "dogovori:saved-document-updated";

export function emitSavedDocumentUpdated(documentId: string) {
  if (typeof window === "undefined" || !documentId) return;
  window.dispatchEvent(
    new CustomEvent(SAVED_DOCUMENT_UPDATED_EVENT, { detail: { documentId } }),
  );
}

/** Етикет на целта на български — без технически път към полето. */
export function proposalTargetLabel(path: string): string {
  if (path === "title") return "Заглавие на документа";
  if (path === "payload.intro") return "Уводен текст";
  if (path === "payload.closing") return "Заключение";
  if (path === "payload.text") return "Текст на документа";
  const m = path.match(/^payload\.(sections|clauses)\[(\d{1,3})\]\.(heading|body|title)$/);
  if (!m) return "Елемент от документа";
  const nr = Number(m[2]) + 1;
  if (m[1] === "sections") {
    return m[3] === "heading" ? `Заглавие на секция ${nr}` : `Текст на секция ${nr}`;
  }
  return m[3] === "title" ? `Заглавие на клауза ${nr}` : `Текст на клауза ${nr}`;
}

export function proposalStatusLabel(status: ProposalStatus): string {
  switch (status) {
    case "pending":
      return "Чака Вашето решение";
    case "accepted":
      return "Приложена промяна";
    case "rejected":
      return "Отказана промяна";
    case "reverted":
      return "Върната промяна";
  }
}

function mapRow(row: Record<string, unknown>): EditProposal {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    savedDocumentId: String(row.saved_document_id),
    targetPath: String(row.target_path),
    before: String(row.before_text ?? ""),
    after: String(row.after_text ?? ""),
    reason: (row.reason as string | null) ?? null,
    status: String(row.status) as ProposalStatus,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

/**
 * Предложенията на КОНКРЕТЕН разговор за КОНКРЕТЕН документ. RLS ограничава
 * до собствените редове; допълнително филтрираме по документ, за да не се
 * покаже карта от друг обхват.
 */
export async function loadThreadProposals(
  threadId: string,
  savedDocumentId: string,
): Promise<{ ok: true; proposals: EditProposal[] } | { ok: false }> {
  // Таблицата още не е в генерираните типове — четенето остава RLS-обхванато.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("assistant_edit_proposals")
    .select(
      "id, thread_id, saved_document_id, target_path, before_text, after_text, reason, status, created_at",
    )
    .eq("thread_id", threadId)
    .eq("saved_document_id", savedDocumentId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false };
  return { ok: true, proposals: ((data ?? []) as Record<string, unknown>[]).map(mapRow) };
}

/** Решението се взема САМО от сървъра — тук няма локално прилагане. */
export async function submitProposalAction(
  accessToken: string,
  proposalId: string,
  action: ProposalAction,
): Promise<ProposalActionResult> {
  try {
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-edit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ proposalId, action }),
      },
    );
    const json = await resp.json().catch(() => null);
    if (!json || typeof json !== "object") return { ok: false, code: "unexpected_error" };
    return json as ProposalActionResult;
  } catch {
    return { ok: false, code: "network_error" };
  }
}

/** Съобщение за потребителя по код на грешка — без технически детайли. */
export function proposalErrorMessage(code?: string): string {
  switch (code) {
    case "stale_base":
    case "stale_value":
      return "Документът е променен след това предложение. Отворете документа и поискайте ново предложение.";
    case "stale_state":
      return "Документът е променен след прилагането — тази промяна вече не може да бъде върната автоматично.";
    case "invalid_transition":
      return "Това предложение вече има решение.";
    case "forbidden":
      return "Нямате достъп до този документ.";
    case "proposal_not_found":
      return "Предложението вече не е налично.";
    case "thread_mismatch":
      return "Разговорът е обвързан с друг документ. Започнете нов разговор.";
    case "network_error":
      return "Няма връзка със сървъра. Опитайте отново.";
    default:
      return "Действието не бе изпълнено. Опитайте отново.";
  }
}
