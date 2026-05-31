import logoImg from "@/assets/logo-dogovori.webp";

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
        <div className="flex items-center gap-2">
          <span className="truncate font-serif text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Dogovori<span className="text-gold">.net</span>
          </span>
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open("https://im-development.imot.bg", "_blank", "noopener,noreferrer");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                window.open("https://im-development.imot.bg", "_blank", "noopener,noreferrer");
              }
            }}
            className="hidden cursor-pointer items-center text-[8px] uppercase tracking-[0.14em] text-muted-foreground/60 transition-colors hover:text-gold sm:inline-flex"
          >
            Powered by <span className="ml-0.5 text-gold/70">IM Development</span>
          </span>
        </div>
        <span className={`${compact ? "hidden sm:block" : ""} text-[10px] uppercase tracking-[0.2em] text-muted-foreground`}>
          Архитект на Вашите сделки
        </span>
      </div>
    </div>
  );
}
