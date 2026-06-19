import logoImg from "@/assets/logo-dogovori-digital.png";

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoImg}
        alt="Dogovori.net — Архитект на Вашите сделки"
        width={220}
        height={56}
        loading="eager"
        decoding="async"
        className="h-11 w-auto select-none drop-shadow-[0_2px_8px_rgba(212,168,76,0.25)] sm:h-12 md:h-14"
      />
      <div className="hidden min-w-0 flex-col leading-none 2xl:flex">
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
          className="cursor-pointer text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:text-gold"
        >
          Powered by <span className="text-gold/80">IM Development</span>
        </span>
        <span
          className={`${compact ? "hidden 2xl:block" : ""} mt-1 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground/80`}
        >
          Архитект на Вашите сделки
        </span>
      </div>
    </div>
  );
}
