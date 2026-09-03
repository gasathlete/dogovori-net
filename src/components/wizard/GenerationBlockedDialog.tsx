/**
 * GenerationBlockedDialog — ясен интерфейс при спряно генериране
 * (`doc_generate_blocked`), вместо суров тост с текст на грешка.
 *
 * Две причини:
 *  - `quota_exceeded` → 1-click път до планове или бърз топ-ъп пакет.
 *  - `confirmation_required` → едно ясно действие за потвърждение и продължаване.
 *
 * Цените и пакетите идват от `src/lib/pricing.ts` (единствен източник).
 */
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Coins, Crown, ShieldCheck } from "@/icons";
import {
  LAWYER_FEE_MIN_EUR,
  PRICING_PLANS,
  TOPUP_PACK_CONFIG,
  fmtEur,
  monthlyLabel,
  opsLabel,
} from "@/lib/pricing";

export type BlockedReason = "quota_exceeded" | "confirmation_required";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: BlockedReason;
  /** Изпълнява се при „Потвърждавам и продължи“ (само за confirmation_required). */
  onConfirm?: () => void;
}

const SUBSCRIPTION_PATH = "/account?tab=subscription";

export function GenerationBlockedDialog({ open, onOpenChange, reason, onConfirm }: Props) {
  const navigate = useNavigate();
  const pack = TOPUP_PACK_CONFIG[0];
  const quota = reason === "quota_exceeded";

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-gold/30 bg-card">
        <DialogHeader className="space-y-1.5">
          <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            {quota ? (
              <Coins className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden />
            )}
          </div>
          <DialogTitle className="text-center font-serif text-xl leading-tight">
            {quota ? "Изчерпани операции за този месец" : "Нужно е едно потвърждение"}
          </DialogTitle>
          <DialogDescription className="text-center text-[13px]">
            {quota ? (
              <>
                Документът ви е запазен. Отключете го веднага с абонамент или с единичен пакет
                операции.
              </>
            ) : (
              <>
                Открихме лични данни в отговорите. Потвърдете обработката им само за този документ
                и продължаваме веднага.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {quota ? (
          <>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                Спестявате над {LAWYER_FEE_MIN_EUR} € адвокатски хонорар за всеки договор.
              </span>{" "}
              {PRICING_PLANS.professional.name} — {monthlyLabel("professional")} (
              {opsLabel("professional")}).
            </div>
            <div className="mt-1 flex flex-col gap-2">
              <Button
                onClick={() => go(SUBSCRIPTION_PATH)}
                className="h-11 w-full gap-2 bg-gradient-gold text-navy hover:shadow-gold"
              >
                <Crown className="h-4 w-4" aria-hidden />
                Преглед на плановете
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                onClick={() => go(`${SUBSCRIPTION_PATH}&topup=1`)}
                className="h-11 w-full gap-2 border-gold/40 hover:bg-gold/10 hover:text-gold"
              >
                <Coins className="h-4 w-4" aria-hidden />
                Бърз пакет: {pack.ops} операции за {fmtEur(pack.eur)}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Топ-ъп пакетите са за активни абонати · цените са с включен ДДС.
              </p>
            </div>
          </>
        ) : (
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
              Обработваме данните единствено за изготвянето на този документ (GDPR, чл. 6, ал. 1,
              б. „а“).
            </div>
            <Button
              onClick={() => {
                onOpenChange(false);
                onConfirm?.();
              }}
              className="h-11 w-full gap-2 bg-gradient-gold text-navy hover:shadow-gold"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Потвърждавам и продължи
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 w-full"
            >
              Ще редактирам отговорите
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GenerationBlockedDialog;
