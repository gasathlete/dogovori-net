import { useState, useCallback } from "react";
import { ChevronDown, Check } from "@/icons";
import { cn } from "@/lib/utils";
import type { CategoryGroup } from "@/lib/planCategories";
import { trackEvent } from "@/lib/analytics";
import type { PlanId } from "@/hooks/usePlans";

interface Props {
  planId: PlanId;
  groups: CategoryGroup[];
  highlightPlan?: boolean;
}

export function PlanCategoryAccordion({ planId, groups }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback(
    (id: string) => {
      setOpenId((prev) => {
        const next = prev === id ? null : id;
        if (next) {
          trackEvent("plans_category_expanded", { plan: planId, category: next });
        }
        return next;
      });
    },
    [planId],
  );

  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => {
        if (!g.items.length) return null;
        const open = openId === g.id;
        const Icon = g.icon;
        return (
          <div
            key={g.id}
            className={cn(
              "group/cat rounded-xl border bg-card/40 transition-all duration-200",
              open
                ? "border-brand/45 shadow-[0_0_0_1px_hsl(var(--brand)/0.15)]"
                : "border-hairline/70 hover:border-brand/30",
            )}
          >
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left min-h-[44px]"
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                  open
                    ? "bg-gradient-brand text-white"
                    : "bg-brand/8 text-brand",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate text-[13px] font-medium text-foreground">
                {g.label}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
                  open && "rotate-180 text-brand",
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                {open && (
                  <div className="relative px-3 pb-3">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-3 right-3 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent animate-[goldSweep_600ms_ease-out]"
                    />
                    {g.highlight && (
                      <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/35 bg-brand/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                        <span className="h-1 w-1 rounded-full bg-brand" />
                        <span className="truncate">{g.highlight}</span>
                      </div>
                    )}
                    <ul className="mt-2 space-y-1.5">
                      {g.items.map((it, i) => (
                        <li
                          key={it}
                          className="flex items-start gap-2 text-[13px] text-foreground/90 opacity-0 animate-[planFadeUp_320ms_ease-out_forwards]"
                          style={{ animationDelay: `${i * 45}ms` }}
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                          <span className="leading-snug">{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
