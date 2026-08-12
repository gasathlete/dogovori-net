import { Check, ShieldCheck, Fingerprint, PenTool } from "@/icons";
import { DTRUST_LEVEL_LABEL, type DtrustLevel } from "@/lib/dtrust";
import { cn } from "@/lib/utils";

const ORDER: DtrustLevel[] = ["basic", "verified", "qualified"];

const META: Record<
  DtrustLevel,
  { icon: typeof PenTool; blurb: string; note: string }
> = {
  basic: {
    icon: PenTool,
    blurb: "Подпис с рисуване или качено изображение + одитна следа.",
    note: "Подходящ за вътрешни и нискорискови документи.",
  },
  verified: {
    icon: Fingerprint,
    blurb: "Потвърдена самоличност чрез имейл/SMS код и отпечатък на документа.",
    note: "Доказва кой е подписал и че документът не е променян.",
  },
  qualified: {
    icon: ShieldCheck,
    blurb: "Квалифициран подпис през доставчик на доверителни услуги (B-Trust).",
    note: "Правна сила на собственоръчен подпис по eIDAS.",
  },
};

interface Props {
  value: DtrustLevel;
  onChange: (level: DtrustLevel) => void;
  /** Нива, недостъпни за текущия план — показват се, но не се избират. */
  lockedLevels?: DtrustLevel[];
  className?: string;
}

export function DtrustLevelPicker({ value, onChange, lockedLevels = [], className }: Props) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)} role="radiogroup" aria-label="Ниво на електронен подпис">
      {ORDER.map((level) => {
        const label = DTRUST_LEVEL_LABEL[level];
        const meta = META[level];
        const Icon = meta.icon;
        const locked = lockedLevels.includes(level);
        const active = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={locked}
            onClick={() => onChange(level)}
            className={cn(
              "group relative flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition-all",
              active
                ? "border-gold/60 bg-gradient-card shadow-soft"
                : "border-border/60 bg-card/60 hover:border-gold/40 hover:bg-muted/40",
              locked && "cursor-not-allowed opacity-55 hover:border-border/60",
            )}
          >
            <div className="flex items-center justify-between">
              <Icon className={cn("h-5 w-5", active ? "text-gold" : "text-muted-foreground")} />
              {active && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            </div>
            <div>
              <p className="font-serif text-sm font-bold">{label.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label.legal}</p>
            </div>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
            <p className="mt-auto text-[11px] text-muted-foreground/80">{meta.note}</p>
            {locked && (
              <span className="absolute right-3 top-3 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] font-semibold">
                Недостъпно
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
