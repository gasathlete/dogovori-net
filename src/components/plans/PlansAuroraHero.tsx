/**
 * PlansAuroraHero — премиум hero за /plans без видео файл.
 *
 * CSS-only анимиран brand градиент (два бавно движещи се радиални слоя) +
 * фина техническа мрежа. Изцяло на семантични токени, работи в двете теми.
 * При `prefers-reduced-motion` движението спира и остава статичен градиент.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  kicker?: string;
  children: ReactNode;
  className?: string;
}

export function PlansAuroraHero({ kicker, children, className }: Props) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[28px] border border-hairline bg-card/40 px-4 py-10 backdrop-blur-md sm:px-8 sm:py-14",
        className,
      )}
    >
      {/* Aurora слой 1 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[30%] opacity-70 motion-safe:animate-[auroraDrift_22s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(ellipse 45% 40% at 30% 30%, hsl(var(--brand) / 0.28), transparent 70%)",
        }}
      />
      {/* Aurora слой 2 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[30%] opacity-60 motion-safe:animate-[auroraDriftAlt_28s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(ellipse 40% 38% at 70% 60%, hsl(var(--brand-light) / 0.22), transparent 72%)",
        }}
      />
      {/* Техническа мрежа */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground) / 0.14) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.14) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* Светлинен sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent motion-safe:animate-[sheen_7s_ease-in-out_infinite]"
      />

      <div className="relative z-10">
        {kicker && (
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">
            {kicker}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
