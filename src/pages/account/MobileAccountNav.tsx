/**
 * Компактна навигация на профила за телефон.
 *
 * Един стабилен ред от три основни раздела („Документи · Начало · План") и
 * едно достъпно „Още" за всички второстепенни раздели. Без хоризонтален
 * скрол и без вложени акордеони.
 */
import { useEffect, useState } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "@/icons";
import type { TabDef } from "./ScrollableTabsList";

export function MobileAccountNav({
  primary,
  secondary,
  value,
}: {
  primary: TabDef[];
  secondary: TabDef[];
  value: string;
}) {
  const secondaryActive = secondary.some((t) => t.value === value);
  const [moreOpen, setMoreOpen] = useState(secondaryActive);

  // Ако активният раздел е второстепенен, „Още" остава отворено.
  useEffect(() => {
    if (secondaryActive) setMoreOpen(true);
  }, [secondaryActive]);

  return (
    <div data-testid="mobile-account-nav" className="md:hidden">
      <TabsList className="flex h-auto w-full flex-col gap-2 bg-transparent p-0">
        <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
          {primary.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[12px] font-semibold transition-all duration-200 active:scale-[0.98] data-[state=active]:bg-gold/[0.14] data-[state=active]:text-gold data-[state=active]:shadow-none"
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span className="truncate">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="mobile-account-more"
          className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-border/60 px-3.5 text-[13px] font-semibold text-foreground/80 transition-colors duration-200 hover:text-foreground"
        >
          Още
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
          />
        </button>

        {moreOpen && (
          <div
            id="mobile-account-more"
            className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border/50 bg-background/40 p-2"
          >
            {secondary.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex min-h-[44px] items-center justify-start gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-200 data-[state=active]:bg-gold/10 data-[state=active]:text-gold data-[state=active]:shadow-none"
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </div>
        )}
      </TabsList>
    </div>
  );
}
