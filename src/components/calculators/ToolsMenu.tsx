import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { Calculator as CalcIcon, ChevronDown, ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CALCULATORS } from "@/data/calculators";

interface Props {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function ToolsMenu({ variant = "desktop", onNavigate }: Props) {
  if (variant === "mobile") {
    return (
      <details className="rounded-md">
        <summary className="flex cursor-pointer items-center justify-between rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-gold/5 hover:text-gold">
          <span className="inline-flex items-center gap-2">
            <CalcIcon className="h-4 w-4" />
            Инструменти
          </span>
          <ChevronDown className="h-4 w-4 transition-transform [details[open]_&]:rotate-180" />
        </summary>
        <ul className="ml-2 mt-1 space-y-0.5 border-l border-border/40 pl-3">
          {CALCULATORS.map((c) => {
            const Icon = (Icons as any)[c.icon] ?? CalcIcon;
            return (
              <li key={c.slug}>
                <Link
                  to={`/tools/${c.slug}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-gold/5 hover:text-gold"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-gold/70" />
                  {c.shortTitle}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              to="/tools"
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-gold transition-colors hover:bg-gold/5"
            >
              Виж всички инструменти <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        </ul>
      </details>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden h-9 items-center gap-1.5 rounded-full border border-gold/25 bg-gold/[0.06] px-4 text-[11px] font-semibold tracking-[0.12em] text-gold transition-colors hover:bg-gold/10 xl:inline-flex"
        >
          <CalcIcon className="h-3.5 w-3.5" />
          ИНСТРУМЕНТИ
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[480px] border-gold/20 bg-navy/95 p-3 backdrop-blur-xl"
      >
        <div className="mb-2 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/60">
          Правни калкулатори
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {CALCULATORS.map((c) => {
            const Icon = (Icons as any)[c.icon] ?? CalcIcon;
            return (
              <li key={c.slug}>
                <Link
                  to={`/tools/${c.slug}`}
                  className="group flex items-start gap-2.5 rounded-md p-2.5 text-left transition-colors hover:bg-gold/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gold/25 bg-gold/[0.05] text-gold transition-colors group-hover:border-gold/50">
                    <Icon className="h-4 w-4" strokeWidth={1.6} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-foreground group-hover:text-gold">
                      {c.shortTitle}
                    </div>
                    <div className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">
                      {c.description}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 border-t border-border/40 pt-2">
          <Link
            to="/tools"
            className="flex items-center justify-between rounded-md px-2.5 py-2 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/5"
          >
            Виж всички инструменти
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
