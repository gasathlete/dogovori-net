import { Scale } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-gradient-gold shadow-gold">
        <Scale className="h-5 w-5 text-navy" strokeWidth={2.2} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-serif text-xl font-bold tracking-tight text-foreground">
          Dogovori<span className="text-gold">.net</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          AI Legal Architect
        </span>
      </div>
    </div>
  );
}
