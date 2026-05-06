import { Logo } from "./Logo";
import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-navy/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link to="/catalog" className="transition-colors hover:text-gold">Каталог</Link>
          <Link to="/#sectors" className="transition-colors hover:text-gold">Сектори</Link>
          <Link to="/#process" className="transition-colors hover:text-gold">Как работи ?</Link>
          <Link to="/#compliance" className="transition-colors hover:text-gold">Съответствие</Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold sm:inline-block">
            ЗЗД · ТЗ · ЗУТ
          </span>
        </div>
      </div>
    </header>
  );
}
