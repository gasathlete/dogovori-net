import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Star, ShieldCheck, Gift, Loader2, MessageSquarePlus } from "@/icons";

const STORAGE_KEY_COUNT = "dogovori_wizard_feedback_prompts_count_v1";
const STORAGE_KEY_LAST = "dogovori_wizard_feedback_last_ts_v1";
const STORAGE_KEY_SUBMITTED = "dogovori_wizard_feedback_submitted_count_v1";
const LIFETIME_PROMPT_CAP = 3;
const LIFETIME_REWARD_CAP = 3;
const MIN_HOURS_BETWEEN_PROMPTS = 6;

/** Read/write helpers with silent fallback. */
function safeGet(k: string): string | null {
  try { return typeof window !== "undefined" ? window.localStorage.getItem(k) : null; } catch { return null; }
}
function safeSet(k: string, v: string) {
  try { window.localStorage.setItem(k, v); } catch { /* noop */ }
}

/**
 * Should we open the prompt for this beta user right now?
 * - Only for authenticated users during beta.
 * - Cap at LIFETIME_PROMPT_CAP shows total.
 * - At least MIN_HOURS_BETWEEN_PROMPTS between shows.
 * - Never after the user has hit LIFETIME_REWARD_CAP submitted+rewarded feedbacks.
 */
export function shouldShowWizardFeedbackPrompt(isAuthed: boolean): boolean {
  if (!isAuthed) return false;
  const shown = Number(safeGet(STORAGE_KEY_COUNT) ?? "0");
  const submitted = Number(safeGet(STORAGE_KEY_SUBMITTED) ?? "0");
  if (shown >= LIFETIME_PROMPT_CAP) return false;
  if (submitted >= LIFETIME_REWARD_CAP) return false;
  const lastTs = Number(safeGet(STORAGE_KEY_LAST) ?? "0");
  const hoursSince = (Date.now() - lastTs) / 36e5;
  if (lastTs > 0 && hoursSince < MIN_HOURS_BETWEEN_PROMPTS) return false;
  return true;
}

export function markWizardFeedbackPromptShown() {
  const shown = Number(safeGet(STORAGE_KEY_COUNT) ?? "0");
  safeSet(STORAGE_KEY_COUNT, String(shown + 1));
  safeSet(STORAGE_KEY_LAST, String(Date.now()));
}

function markSubmitted() {
  const s = Number(safeGet(STORAGE_KEY_SUBMITTED) ?? "0");
  safeSet(STORAGE_KEY_SUBMITTED, String(s + 1));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra context stored with the feedback row (e.g. doc name, trigger). */
  context?: Record<string, unknown>;
}

/**
 * Beta wizard-feedback prompt. Insists gently — asks for a 1–5 star rating and
 * a short note about the experience. Rewards up to 2 ops (max 3 rewards ever
 * per user, enforced server-side).
 */
export function WizardFeedbackPrompt({ open, onOpenChange, context }: Props) {
  const [rating, setRating] = useState<number>(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);

  const reset = () => {
    setRating(5);
    setBody("");
    setBusy(false);
    setAwarded(null);
  };

  const submit = async () => {
    if (body.trim().length < 10) {
      toast.error("Моля, споделете поне няколко думи (мин. 10 символа).");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_wizard_feedback", {
      _rating: rating,
      _body: body.trim(),
      _subject: `Wizard · ${(context?.docName as string) || "документ"}`,
      _source_context: (context ?? {}) as never,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Възникна грешка. Опитайте пак.");
      return;
    }
    const res = data as { ok: boolean; awarded_ops?: number; error?: string } | null;
    if (!res?.ok) {
      toast.error(res?.error === "too_short" ? "Малко повече детайл?" : "Неуспех при запис.");
      return;
    }
    markSubmitted();
    setAwarded(res.awarded_ops ?? 0);
    if ((res.awarded_ops ?? 0) > 0) {
      toast.success(`Благодарим! +${res.awarded_ops} операции са добавени в баланса Ви.`);
    } else {
      toast.success("Благодарим за обратната връзка!");
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-border/60 bg-card p-0 sm:max-w-lg">
        <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-gold/12 via-card to-card px-5 pt-5 pb-4 pr-14 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gold/20 blur-3xl"
          />
          <DialogHeader className="relative space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <MessageSquarePlus className="h-3 w-3" aria-hidden />
                Бета обратна връзка
              </span>
              {awarded === null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <Gift className="h-3 w-3" aria-hidden /> +2 операции
                </span>
              )}
            </div>
            <DialogTitle className="text-balance font-serif text-[19px] leading-tight tracking-tight sm:text-[22px]">
              {awarded === null
                ? "Моля, оставете обратна връзка за преживяването"
                : "Благодарим Ви!"}
            </DialogTitle>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {awarded === null
                ? "Работим в бета — Вашето мнение оформя следващата версия. Като благодарност добавяме 2 операции към баланса Ви."
                : awarded > 0
                ? `Добавихме +${awarded} операции към баланса Ви. Продължавайте да ни давате обратна връзка — правите продукта по-добър.`
                : "Записахме Вашия отзив. Достигнахте лимита от бонус-награди за бета периода, но Вашето мнение все още е ценно за нас."}
            </p>
          </DialogHeader>
        </div>

        {awarded === null ? (
          <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Оценете преживяването
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} от 5`}
                    className={`rounded-md p-1 transition-colors ${
                      n <= rating ? "text-gold" : "text-muted-foreground/40 hover:text-gold/70"
                    }`}
                  >
                    <Star className={`h-6 w-6 ${n <= rating ? "fill-current" : ""}`} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Кое сработи, кое не?
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Напр.: интервюто беше ясно, но при стъпка 3 не разбрах какво се иска…"
                rows={4}
                maxLength={2000}
                className="resize-none border-border/60 bg-background/60 text-sm"
              />
              <div className="mt-1 text-right text-[10px] text-muted-foreground/70">
                {body.length}/2000
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2.5 text-[11.5px] leading-snug text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <p>
                <strong className="text-foreground">Строга конфиденциалност:</strong>{" "}
                съдържанието на Вашия документ не се предава заедно с този отзив.
                Записваме само оценката, коментара Ви и типа документ.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
                className="text-muted-foreground"
              >
                Не сега
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={busy || body.trim().length < 10}
                className="bg-gradient-to-r from-gold to-gold/85 text-navy shadow-gold hover:-translate-y-px"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Изпращам…
                  </>
                ) : (
                  <>Изпрати и вземи +2 операции</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end px-5 pb-5 pt-2 sm:px-6">
            <Button size="sm" onClick={() => handleOpenChange(false)}>
              Затвори
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
