import { BrandLogo } from "@/components/BrandLogo";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return <BrandLogo className={className} compact={compact} />;
}
