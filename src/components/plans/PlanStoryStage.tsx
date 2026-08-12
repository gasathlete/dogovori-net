/**
 * PlanStoryStage — етап от scroll storytelling презентацията на /plans.
 *
 * Разкрива съдържанието при влизане във viewport (IntersectionObserver,
 * без външни библиотеки) и излъчва аналитично събитие веднъж на етап.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

interface Props {
  index: string;
  title: string;
  subtitle?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}

export function PlanStoryStage({ index, title, subtitle, id, children, className }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const tracked = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setVisible(true);
          if (!tracked.current) {
            tracked.current = true;
            trackEvent("plans_story_stage_viewed", { stage: index });
          }
          observer.disconnect();
        });
      },
      { threshold: 0.18 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  return (
    <section
      ref={ref}
      id={id}
      className={cn("relative z-10 mx-auto max-w-7xl scroll-mt-24 px-4 py-10 sm:py-14", className)}
    >
      <div className="mb-6 flex items-start gap-4 sm:mb-8">
        <span
          aria-hidden
          className={cn(
            "select-none font-serif text-4xl font-semibold leading-none text-brand/25 transition-all duration-700 sm:text-5xl",
            visible ? "opacity-100 blur-0" : "opacity-0 blur-[2px]",
          )}
        >
          {index}
        </span>
        <div className="min-w-0">
          <h2
            className={cn(
              "font-serif text-2xl leading-tight text-foreground transition-all duration-700 sm:text-3xl",
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                "mt-1.5 max-w-2xl text-sm text-muted-foreground transition-all delay-100 duration-700 sm:text-base",
                visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div
        className={cn(
          "transition-all delay-150 duration-700 ease-out",
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}
