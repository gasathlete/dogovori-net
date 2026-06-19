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
        <div className="flex items-baseline gap-2.5">
          <span className="whitespace-nowrap font-serif text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Dogovori<span className="text-gold">.net</span>
          </span>
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.open("https://im-development.imot.bg", "_blank", "noopener,noreferrer");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                window.open("https://im-development.imot.bg", "_blank", "noopener,noreferrer");
              }
            }}
            className="relative z-10 hidden cursor-pointer items-center text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:text-gold 2xl:inline-flex"
          >
            Powered by <span className="ml-1 text-gold/80">IM Development</span>
          </span>
        </div>
        <span
          className={`${compact ? "hidden 2xl:block" : ""} mt-1.5 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground/80`}
        >
          Архитект на Вашите сделки
        </span>

      </div>

    </div>
  );
}
