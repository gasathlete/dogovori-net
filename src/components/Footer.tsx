import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-navy-light/40 py-10">
      <div className="container flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <Logo />
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dogovori.net · Генерираните договори не заместват консултация с адвокат.
        </div>
      </div>
    </footer>
  );
}
