import { useMemo, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "@/icons";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/components/wizard/RiskMeter";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { GENERAL_ASSISTANCE_NOTE } from "@/lib/prelaunch";

const RISK_META: Record<RiskLevel, { label: string; color: string; bar: string; tone: string; Icon: typeof ShieldCheck }> = {
  low: { label: "Нисък риск", color: "text-success", bar: "bg-success", tone: "border-success/30 bg-success/5", Icon: ShieldCheck },
  medium: { label: "Среден риск", color: "text-warning", bar: "bg-warning", tone: "border-warning/30 bg-warning/5", Icon: ShieldAlert },
  high: { label: "Висок риск", color: "text-danger", bar: "bg-danger", tone: "border-danger/30 bg-danger/5", Icon: ShieldAlert },
  unknown: { label: "Анализ предстои", color: "text-muted-foreground", bar: "bg-muted", tone: "border-border bg-muted/20", Icon: ShieldQuestion },
};

export type ResultSection = {
  id: string;
  title: string;
  /** Кратък бадж вдясно от заглавието (напр. брой корекции). */
  badge?: string;
  /** Визуален тон на баджа. */
  badgeTone?: "neutral" | "warning" | "danger" | "success";
  hint?: string;
  content: ReactNode;
  /** Отваря секцията по подразбиране (еднократно, при първи render). */
  defaultOpen?: boolean;
};

const BADGE_TONES: Record<NonNullable<ResultSection["badgeTone"]>, string> = {
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
};

/**
 * Компактна обвивка на екрана след генериране: една лента с риска и
 * сгъваеми секции вместо десет самостоятелни карти.
 */
export function ResultShell({
  risk,
  sections,
  riskSectionId,
  footer,
  className,
}: {
  risk?: { level: RiskLevel; score?: number; summary?: string };
  sections: ResultSection[];
  /** Секцията, която се отваря при клик върху лентата с риска. */
  riskSectionId?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const initialOpen = useMemo(
    () => sections.filter((s) => s.defaultOpen).map((s) => s.id),
    // еднократно — иначе секции биха се отваряли сами при всеки render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [open, setOpen] = useState<string[]>(initialOpen);

  const m = RISK_META[risk?.level ?? "unknown"];
  const pct = typeof risk?.score === "number" ? Math.max(2, Math.min(100, risk.score)) : 0;

  return (
    <div className={cn("space-y-3", className)}>
      <LegalDisclaimer>{GENERAL_ASSISTANCE_NOTE}</LegalDisclaimer>
      {risk && (
        <button
          type="button"
          onClick={() => {
            if (!riskSectionId) return;
            setOpen((prev) => (prev.includes(riskSectionId) ? prev : [...prev, riskSectionId]));
            requestAnimationFrame(() => {
              document.getElementById(`result-section-${riskSectionId}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            });
          }}
          className={cn(
            "w-full rounded-xl border p-3 text-left transition-colors",
            m.tone,
            riskSectionId && "hover:brightness-105",
          )}
        >
          <div className="flex items-center gap-2">
            <m.Icon className={cn("h-4 w-4 shrink-0", m.color)} aria-hidden />
            <span className={cn("text-xs font-semibold uppercase tracking-wider", m.color)}>{m.label}</span>
            {typeof risk.score === "number" && (
              <span className={cn("ml-auto font-serif text-base font-bold", m.color)}>{risk.score}/100</span>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/40">
            <div className={cn("h-full transition-all duration-700", m.bar)} style={{ width: `${pct}%` }} />
          </div>
          {risk.summary && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{risk.summary}</p>
          )}
        </button>
      )}

      <Accordion
        type="multiple"
        value={open}
        onValueChange={setOpen}
        className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
      >
        {sections.map((s) => (
          <AccordionItem
            key={s.id}
            value={s.id}
            id={`result-section-${s.id}`}
            className="border-b border-border/60 px-4 last:border-b-0 scroll-mt-24"
          >
            <AccordionTrigger className="min-h-[44px] gap-3 py-3.5 text-left text-sm hover:no-underline">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium text-foreground">{s.title}</span>
                {s.badge && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      BADGE_TONES[s.badgeTone ?? "neutral"],
                    )}
                  >
                    {s.badge}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              {s.hint && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{s.hint}</p>}
              <div className="animate-fade-in space-y-4">{s.content}</div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {footer}
    </div>
  );
}
