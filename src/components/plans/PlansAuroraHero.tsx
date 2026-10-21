/**
 * PlansAuroraHero — премиум hero за /plans без видео файл.
 *
 * Редакционна, плоска версия: без анимирани градиенти, мрежи или стъкло.
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
    <section className={cn("border-b border-border pb-10 pt-4 sm:pb-14", className)}>
      {kicker && <p className="mb-3 text-sm text-muted-foreground">{kicker}</p>}
      {children}
    </section>
  );
}
