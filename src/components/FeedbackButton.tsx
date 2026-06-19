import { Link } from "react-router-dom";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  source: string;
  className?: string;
  label?: string;
  variant?: "chip" | "ghost" | "icon" | "link";
  title?: string;
}

/**
 * Reusable "Обратна връзка" trigger that navigates to /feedback?source=<key>
 * so the form can pre-fill the "from where" context.
 */
export function FeedbackButton({
  source,
  className,
  label = "Обратна връзка",
  variant = "chip",
  title,
}: Props) {
  const href = `/feedback?source=${encodeURIComponent(source)}`;
  const base = "inline-flex items-center gap-1.5 transition-colors";
  const styles =
    variant === "chip"
      ? "rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-gold/40 hover:text-gold"
      : variant === "ghost"
      ? "rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-gold"
      : variant === "icon"
      ? "rounded-md p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-gold"
      : "text-xs text-muted-foreground hover:text-gold";
  return (
    <Link to={href} className={cn(base, styles, className)} title={title || label}>
      <MessageSquarePlus className="h-3.5 w-3.5" />
      {variant !== "icon" && <span>{label}</span>}
    </Link>
  );
}
