import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-navy-light/40 py-10">
      <div className="container flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="flex flex-col gap-2">
          <Logo />
          <a
            href="https://im-development.imot.bg"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-[52px] inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold"
          >
            Powered by <span className="font-semibold text-gold/90">IM Development</span>
          </a>
        </div>
        <div className="text-xs text-muted-foreground md:text-right">
          © {new Date().getFullYear()} Dogovori.net · Изготвените договори не заместват консултация с адвокат.
        </div>
      </div>
    </footer>
  );
}
