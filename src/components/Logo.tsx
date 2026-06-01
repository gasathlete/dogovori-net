import logoImg from "@/assets/logo-dogovori.webp";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-navy-light/60 shadow-soft ring-1 ring-inset ring-gold/10">
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
      <div className="flex min-w-0 flex-col leading-none">
        <div className="flex items-baseline gap-2.5">
          <span className="truncate font-serif text-xl font-bold tracking-tight text-foreground">
            Dogovori<span className="text-gold">.net</span>
          </span>
          <a
            href="https://im-development.imot.bg"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden cursor-pointer items-center text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:text-gold xl:inline-flex"
          >
            Powered by <span className="ml-1 text-gold/80">IM Development</span>
          </a>
        </div>
        <span
          className={`${compact ? "hidden xl:block" : ""} mt-1.5 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground/80`}
        >
          Архитект на Вашите сделки
        </span>
      </div>
    </div>
  );
}
