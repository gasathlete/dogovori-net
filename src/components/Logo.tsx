import logoImg from "@/assets/logo-dogovori.png";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${className}`}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-navy-light/60 shadow-soft">
        <img
          src={logoImg}
          alt="Dogovori.net лого"
          width={40}
          height={40}
          loading="eager"
          decoding="async"
          className="h-9 w-9 object-contain"
        />
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-serif text-lg font-bold tracking-tight text-foreground sm:text-xl">
          Dogovori<span className="text-gold">.net</span>
        </span>
        <span className={`${compact ? "hidden sm:block" : ""} text-[10px] uppercase tracking-[0.2em] text-muted-foreground`}>
          Архитект на Вашите сделки
        </span>
      </div>
    </div>
  );
}
