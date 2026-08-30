/**
 * AudienceToggle — избор на роля ("Фирма" / "Фрийлансър").
 *
 * Не разделяме сайта на две начални страници: едно Hero, но copy-то на
 * ключовите места се сменя според избора. Изборът се пази в localStorage.
 */
import { Briefcase, User } from "@/icons";
import { cn } from "@/lib/utils";
import { useAudience } from "@/hooks/useAudience";
import type { Audience } from "@/lib/audience";

const OPTIONS: { value: Audience; label: string; Icon: typeof Briefcase }[] = [
  { value: "freelancer", label: "Фрийлансър", Icon: User },
  { value: "business", label: "Фирма", Icon: Briefcase },
];

export function AudienceToggle({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const { audience, setAudience } = useAudience();

  return (
    <div
      role="radiogroup"
      aria-label="За кого е платформата"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-gold/25 bg-card/60 p-1 backdrop-blur-sm",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = audience === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setAudience(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
              size === "sm"
                ? "px-3 py-1 text-[11px]"
                : "px-3.5 py-1.5 text-[12px]",
              active
                ? "bg-gold/15 text-gold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default AudienceToggle;
