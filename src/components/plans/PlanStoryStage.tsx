/**
 * PlanStoryStage — етап от scroll storytelling презентацията на /plans.
 *
 * Съдържанието остава видимо; отчита преглед веднъж на етап.
 */
import { useEffect, useRef, type ReactNode } from "react";
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
  const tracked = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
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
      <div className="mb-6 sm:mb-8">
        <h2
          className={cn(
            "max-w-3xl text-balance font-serif text-[26px] leading-[1.2] text-foreground sm:text-3xl",
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={cn(
              "mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        )}
      </div>


      <div
        className={cn(
          "min-w-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}
