/**
 * WorkStateShell — компактна рамка за състоянията на работните екрани:
 * зареждане, празен списък, липсващ документ или грешка.
 *
 * Правилото е едно: един ред заглавие, едно изречение и едно ясно действие.
 * Нищо не обещава резултат, който още не съществува.
 */
import type { ReactNode } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Loader2 } from "@/icons";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/BrandLogo";

export type WorkStateTone = "loading" | "empty" | "problem";

const TONE_CLASS: Record<WorkStateTone, string> = {
  loading: "border-border/60 bg-card/40",
  empty: "border-dashed border-border/70 bg-card/30",
  problem: "border-destructive/40 bg-destructive/[0.06]",
};

export function WorkStateShell({
  tone = "empty",
  eyebrow,
  title,
  description,
  icon,
  actionLabel,
  actionTo,
  onAction,
  secondary,
  className,
  testId,
}: {
  tone?: WorkStateTone;
  /** Кратък контекстен надпис — например „Документи“. */
  eyebrow?: string;
  title: string;
  /** Едно изречение. По-дълго обяснение не влиза тук. */
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  /** По изключение — втора, видимо по-тиха връзка. */
  secondary?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId ?? "work-state"}
      data-state={tone}
      aria-busy={tone === "loading" || undefined}
      className={cn(
        "mx-auto max-w-xl rounded-2xl border px-5 py-8 text-center",
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="flex justify-center text-gold" aria-hidden="true">
        {tone === "loading" ? (
          <span className="relative flex h-10 w-12 items-center justify-center">
            <BrandMark decorative className="h-8 w-[46px] opacity-70" />
            <Loader2 className="absolute size-10 animate-spin opacity-45 motion-reduce:animate-none" />
          </span>
        ) : (icon ?? <BrandMark decorative className="h-9 w-[52px] opacity-75" />)}
      </div>
      {eyebrow && (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-1 font-serif text-xl font-bold leading-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        {description}
      </p>

      {(actionTo || onAction) && (
        <div className="mt-5 flex justify-center">
          {actionTo ? (
            <Link
              to={actionTo}
              className="btn-gold btn-press inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-[15px] font-semibold"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className="btn-gold btn-press inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-[15px] font-semibold"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}

      {secondary && (
        <div className="mt-3 text-[13px] text-muted-foreground">{secondary}</div>
      )}
    </section>
  );
}
