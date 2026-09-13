import { useState } from "react";
import { Sparkles, Loader2, Check, AlertCircle, ChevronDown } from "@/icons";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { type GeneratedContract } from "@/lib/exporters";
import { SensitiveDataNotice } from "@/components/wizard/SensitiveDataNotice";
import {
  parseSensitiveResponse,
  isConfirmationRequired,
  isSpecialCategoryBlocked,
  type ClassificationSummary,
} from "@/lib/aiSensitiveData";

interface RefineDraftBoxProps {
  contract: GeneratedContract;
  answers: Record<string, unknown>;
  onRefined: (next: GeneratedContract, summary: string, changed: string[]) => void;
  onNeedAuth?: () => void;
  onQuotaExceeded?: () => void;
  heading?: string;
  subheading?: string;
}

const EXAMPLES = [
  "Договорът предвижда задържане на двойно капаро от продавача, което противоречи на чл. 93 ЗЗД.",
  "Липсва срок за предаване на имота.",
  "Няма клауза за неустойка при забавено плащане.",
];

/**
 * Interactive AI refinement box shown above the generated document. Sends a
 * single free-text feedback line to `refine-contract`, which applies the
 * minimal change and returns an updated contract. Costs 1 op.
 */
export function RefineDraftBox({
  contract,
  answers,
  onRefined,
  onNeedAuth,
  onQuotaExceeded,
  heading = "Забелязахте пропуск? Опишете го и текстът се коригира.",
  subheading = "Опишете какво липсва или е грешно. AI ще редактира САМО нужното, без да разваля останалия текст.",
}: RefineDraftBoxProps) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [lastChanged, setLastChanged] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  // Диалог за лични / чувствителни данни (GDPR потвърждение преди AI редакция).
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [sensitiveBlocked, setSensitiveBlocked] = useState(false);
  const [sensitiveClass, setSensitiveClass] = useState<ClassificationSummary | null>(null);

  const submit = async (userConfirmed = false) => {
    const text = feedback.trim();
    if (!text) return;
    if (text.length > 1500) {
      toast.error("Съобщението е твърде дълго (макс. 1500 символа).");
      return;
    }
    setBusy(true);
    setLastSummary(null);
    setLastChanged([]);
    try {
      const { newOpBatchId } = await import("@/lib/opSession");
      const { data, error } = await invokeEdgeFunction<{
        contract?: GeneratedContract;
        changed_clause_numbers?: string[];
        change_summary?: string;
        error?: string;
        code?: string;
      }>("refine-contract", {
        body: {
          contract,
          feedback: text,
          answers,
          batch_id: newOpBatchId(),
          userConfirmed,
        },
      });
      if (error || data?.error) {
        const code = data?.code || "";
        const sensitive = await parseSensitiveResponse(error, data);
        if (isSpecialCategoryBlocked(sensitive)) {
          setSensitiveClass(sensitive?.classification ?? null);
          setSensitiveBlocked(true);
          setSensitiveOpen(true);
          return;
        }
        if (isConfirmationRequired(sensitive) || data?.error === "needs_confirmation") {
          setSensitiveClass(sensitive?.classification ?? null);
          setSensitiveBlocked(false);
          setSensitiveOpen(true);
          return;
        }
        if (data?.error === "Unauthorized" || code === "unauthorized") {
          toast.error("Влезте в профила си, за да ползвате AI редакцията.");
          onNeedAuth?.();
          return;
        }
        if (data?.error === "quota_exceeded" || code === "quota_exceeded") {
          toast.error("Изчерпани операции", {
            description: "Купете допълнителен пакет операции, за да продължите.",
          });
          onQuotaExceeded?.();
          return;
        }
        if (code === "rate_limited") {
          toast.error(data?.error || "Дневният лимит е достигнат.");
          return;
        }
        throw new Error(data?.error || error?.message || "Грешка");
      }
      if (!data?.contract) throw new Error("Празен отговор от AI");
      onRefined(data.contract, data.change_summary || "", data.changed_clause_numbers || []);
      setLastSummary(data.change_summary || "Готово.");
      setLastChanged(data.changed_clause_numbers || []);
      setFeedback("");
      toast.success("Договорът е обновен", {
        description: data.change_summary?.slice(0, 140) || "AI приложи Вашата корекция.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Грешка при AI редакция", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/5 via-background to-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={expanded}
            aria-controls="refine-draft-body"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{heading}</h3>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">
                1 операция
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <div
            id="refine-draft-body"
            className={`overflow-hidden transition-all duration-250 ease-in-out ${expanded ? "mt-3 max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <p className="text-xs text-muted-foreground">
              {subheading}
            </p>

            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Например: договорът предвижда задържане на двойно капаро, което е невъзможно по чл. 93 ЗЗД."
              className="mt-3 min-h-[80px] resize-y"
              maxLength={1500}
              disabled={busy}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => setFeedback(ex)}
                  className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-gold/50 hover:text-foreground disabled:opacity-50"
                >
                  {ex.length > 60 ? ex.slice(0, 58) + "…" : ex}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {feedback.length}/1500 · Ctrl/⌘ + Enter за изпращане
              </span>
              <Button size="sm" onClick={() => void submit()} disabled={busy || !feedback.trim()} className="bg-gold text-primary-foreground hover:bg-gold/90">
                {busy ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Коригирам…</>
                ) : (
                  <><Sparkles className="mr-2 h-3.5 w-3.5" /> Приложи корекция</>
                )}
              </Button>
            </div>

            {lastSummary && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <div className="font-medium text-emerald-700 dark:text-emerald-400">Приложено</div>
                  <div className="mt-0.5 text-muted-foreground">{lastSummary}</div>
                  {lastChanged.length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Променени клаузи: {lastChanged.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground/80">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>AI може да греши. Прегледайте промените преди сваляне.</span>
            </div>
          </div>
        </div>
      </div>

      {sensitiveOpen && <SensitiveDataNotice
        onDismiss={() => setSensitiveOpen(false)}
        onConfirm={() => {
          setSensitiveOpen(false);
          void submit(true);
        }}
        classification={sensitiveClass}
        blocked={sensitiveBlocked}
        operationLabel="редакция на документа"
        busy={busy}
      />}
    </div>
  );
}
