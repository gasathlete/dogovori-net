import { Button } from "@/components/ui/button";
import { Loader2, FilePen, ExternalLink } from "@/icons";
import { cn } from "@/lib/utils";
import {
  proposalStatusLabel,
  proposalTargetLabel,
  type EditProposal,
  type ProposalAction,
} from "@/lib/assistantEditProposals";

const MAX_PREVIEW = 1200;

function bounded(text: string): string {
  if (text.length <= MAX_PREVIEW) return text;
  return `${text.slice(0, MAX_PREVIEW)}…`;
}

export function AssistantEditProposalCard({
  proposal,
  busy = false,
  error = null,
  onAction,
  onOpenDocument,
}: {
  proposal: EditProposal;
  busy?: boolean;
  error?: string | null;
  onAction: (action: ProposalAction) => void;
  onOpenDocument?: () => void;
}) {
  const pending = proposal.status === "pending";
  const accepted = proposal.status === "accepted";

  return (
    <section
      aria-label="Предложение за редакция"
      data-testid="edit-proposal-card"
      aria-busy={busy}
      className="w-full max-w-full overflow-hidden rounded-xl border border-gold/30 bg-card/60 p-3 sm:p-4"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FilePen className="h-3.5 w-3.5 shrink-0 text-gold" />
            <span className="truncate">Предложение за редакция</span>
          </div>
          <h3 className="mt-1 break-words font-serif text-base font-bold">
            {proposalTargetLabel(proposal.targetPath)}
          </h3>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs",
            pending ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground",
          )}
        >
          {proposalStatusLabel(proposal.status)}
        </span>
      </div>

      {proposal.reason && (
        <p className="mt-2 break-words text-sm text-muted-foreground">{proposal.reason}</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border/60 bg-background/40 p-2">
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Преди</div>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {bounded(proposal.before)}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-gold/30 bg-gold/5 p-2">
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">След</div>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {bounded(proposal.after)}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 break-words text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pending && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction("accept")}
              className="bg-gradient-gold text-navy"
            >
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Приеми промяната
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("reject")}>
              Откажи
            </Button>
          </>
        )}
        {accepted && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("undo")}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Върни промяната
          </Button>
        )}
        {onOpenDocument && (
          <Button size="sm" variant="ghost" onClick={onOpenDocument} className="text-gold">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Отвори документа
          </Button>
        )}
      </div>
    </section>
  );
}
