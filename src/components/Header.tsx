import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Link } from "react-router-dom";

const NAV = [
  { to: "/catalog", label: "Каталог" },
  { to: "/#sectors", label: "Сектори" },
  { to: "/#process", label: "Как работи ?" },
  { to: "/#compliance", label: "Съответствие" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-navy/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link to="/" onClick={() => setOpen(false)} className="min-w-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="transition-colors hover:text-gold">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold lg:inline-block">
            ЗЗД · ТЗ · ЗУТ
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Затвори менюто" : "Отвори менюто"}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-card/40 text-foreground transition-colors hover:border-gold/50 hover:text-gold md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border/60 bg-navy/95 backdrop-blur-xl md:hidden">
          <div className="container flex flex-col py-2">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-gold/5 hover:text-gold"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-border/60 px-3 py-3">
              <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
                ЗЗД · ТЗ · ЗУТ
              </span>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
