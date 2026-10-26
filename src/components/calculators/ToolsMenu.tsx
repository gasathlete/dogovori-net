import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import * as Icons from "@/icons";
import { Calculator as CalcIcon, ChevronDown, ArrowRight } from "@/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CALCULATOR_MENU as CALCULATORS } from "@/data/calculators/menu";

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
                  className="flex items-center gap-2 rounded-md min-h-11 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-gold/5 hover:text-gold"
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
              className="flex items-center gap-2 rounded-md min-h-11 px-3 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/5"
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
        <Button
          variant="ghost"
          type="button"
          className="group relative inline-flex min-h-11 items-center gap-1 whitespace-nowrap px-3 text-sm font-medium text-foreground/75 hover:text-foreground"
        >
          Инструменти
          <ChevronDown className="h-3 w-3 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(560px,calc(100vw-2rem))] border-border bg-popover p-3 text-popover-foreground"
      >
        <div className="mb-2 px-2 pb-2 text-sm font-semibold text-foreground">
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
                  <div className="flex min-h-8 shrink-0 items-start pt-1 text-gold">
                    <Icon className="h-4 w-4" strokeWidth={1.6} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere] group-hover:text-gold">
                      {c.shortTitle}
                    </div>
                    <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
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
            className="flex items-center justify-between rounded-md px-2.5 py-2 min-h-11 text-sm font-semibold text-gold transition-colors hover:bg-gold/5"
          >
            Виж всички инструменти
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
