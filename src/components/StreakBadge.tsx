/**
 * StreakBadge — компактен индикатор за дневен streak + прогрес.
 * Показва се в header (desktop) и около профил иконата в mobile nav.
 */
import { Flame } from "@/icons";
import { useEngagement } from "@/hooks/useEngagement";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface StreakBadgeProps {
  variant?: "header" | "mobile";
  className?: string;
}

export function StreakBadge({ variant = "header", className }: StreakBadgeProps) {
  const { current_streak, daily_progress, daily_goal, longest_streak } = useEngagement();
  if (current_streak === 0 && daily_progress === 0) return null;

  const goalMet = daily_progress >= daily_goal;
  const pct = Math.min(100, Math.round((daily_progress / Math.max(1, daily_goal)) * 100));

  if (variant === "mobile") {
    return (
      <span
        aria-label={`Streak: ${current_streak} дни`}
        className={cn(
          "absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-navy shadow ring-1 ring-background",
          className,
        )}
      >
        {current_streak}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
            goalMet
              ? "border-gold/50 bg-gold/10 text-gold"
              : "border-border/60 bg-card/40 text-muted-foreground hover:border-gold/30",
            className,
          )}
        >
          <Flame className={cn("h-3.5 w-3.5", goalMet && "fill-current")} />
          <span>
            {current_streak} {current_streak === 1 ? "ден" : "дни"}
          </span>
          <span
            aria-hidden
            className="ml-1 h-1.5 w-8 overflow-hidden rounded-full bg-border/50"
          >
            <span
              className="block h-full bg-gold transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="space-y-0.5 text-xs">
          <div className="font-semibold">Дневен streak: {current_streak} дни</div>
          <div className="text-muted-foreground">
            Днес: {daily_progress} / {daily_goal} {daily_goal === 1 ? "договор" : "договори"}
          </div>
          <div className="text-muted-foreground">Най-дълъг: {longest_streak} дни</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
