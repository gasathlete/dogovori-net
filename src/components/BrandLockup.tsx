import { BrandMark } from "@/components/BrandLogo";
import { HeaderWordmark } from "@/components/HeaderWordmark";
import { cn } from "@/lib/utils";

/** One approved mark + calligraphic wordmark across the public shell. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("brand-lockup", className)}>
      <BrandMark decorative className="brand-lockup-mark" />
      <HeaderWordmark className="brand-lockup-wordmark" />
    </span>
  );
}