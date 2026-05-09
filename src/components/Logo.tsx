import logoImg from "@/assets/logo-dogovori.webp";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-gold/30 bg-navy-light/60 shadow-soft">
        <img
          src={logoImg}
          alt="Dogovori.net лого"
          width={40}
          height={40}
          loading="lazy"
          className="h-9 w-9 object-contain"
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-serif text-xl font-bold tracking-tight text-foreground">
          Dogovori<span className="text-gold">.net</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Архитект на Вашите сделки
        </span>
      </div>
    </div>
  );
}
