import logoImg from "@/assets/logo-dogovori.webp";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-navy-light/60 shadow-soft ring-1 ring-inset ring-gold/10">
        <img
          src={logoImg}
          alt="Dogovori.net лого"
          width={36}
          height={36}
          loading="eager"
          decoding="async"
          className="h-8 w-8 object-contain"
        />
      </div>
      <div className="flex min-w-0 flex-col leading-none">
        <span className="whitespace-nowrap font-serif text-lg font-bold tracking-tight text-foreground sm:text-xl">
          Dogovori<span className="text-gold">.net</span>
        </span>
      </div>
    </div>
  );
}
