/**
 * DownloadRoiDialog — контекстен модал при клик върху „Свали“ от анонимен
 * или безплатен потребител.
 *
 * Целта е свалянето да не води извън контекста: бърз вход/регистрация в
 * модал, след което действието продължава автоматично.
 * Всички цени идват от `src/lib/pricing.ts` (EUR, с ДДС).
 */
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Crown, FileDown, PiggyBank, ShieldCheck } from "@/icons";
import { openInlineAuth } from "@/lib/inlineAuth";
import {
  FREE_OPS_ON_SIGNUP,
  LAWYER_FEE_MIN_EUR,
  PRICING_PLANS,
  monthlyLabel,
  opsLabel,
} from "@/lib/pricing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Форматът, който потребителят е поискал (за етикета на бутона). */
  format?: "pdf" | "docx";
  /** Останали безплатни операции за месеца (по подразбиране месечният лимит). */
  opsLeft?: number | null;
  /** Изпълнява се веднага след успешен вход/регистрация. */
  onProceed: () => void;
}

export function DownloadRoiDialog({
  open,
  onOpenChange,
  format = "pdf",
  opsLeft,
  onProceed,
}: Props) {
  const navigate = useNavigate();
  const remaining = typeof opsLeft === "number" ? Math.max(0, opsLeft) : FREE_OPS_ON_SIGNUP;

  const continueFree = () => {
    onOpenChange(false);
    openInlineAuth({
      action: `Свали ${format.toUpperCase()}`,
      mode: "signup",
      onSuccess: onProceed,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-gold/30 bg-card">
        <DialogHeader className="space-y-1.5">
          <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <FileDown className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="text-center font-serif text-xl leading-tight">
            Документът е готов за сваляне
          </DialogTitle>
          <DialogDescription className="text-center text-[13px]">
            Включва {FREE_OPS_PER_MONTH} безплатни сваляния за този месец — без карта и без
            абонамент.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <PiggyBank className="h-4 w-4" aria-hidden />
            </span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                Спестявате {LAWYER_FEE_MIN_EUR - 30}+ € от адвокатска консултация
              </span>{" "}
              за същия документ — с проверка по ЗЗД и ТЗ и анализ на риска.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <Button
            onClick={continueFree}
            className="h-11 w-full gap-2 bg-gradient-gold text-navy hover:shadow-gold"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Продължи безплатно (Остават {remaining})
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              navigate("/plans?plan=professional&from=download_modal");
            }}
            className="h-11 w-full gap-2 border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            <Crown className="h-4 w-4" aria-hidden />
            Вземи {PRICING_PLANS.professional.name} ({monthlyLabel("professional")})
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            {PRICING_PLANS.professional.name} — {opsLabel("professional")} за пълна правна
            сигурност без ограничения по документи.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DownloadRoiDialog;
