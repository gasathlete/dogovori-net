import { useState } from "react";
import { Menu, X, User as UserIcon, LogIn } from "lucide-react";
import { Logo } from "./Logo";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/catalog", label: "Каталог" },
  { to: "/blog", label: "Блог" },
  { to: "/#sectors", label: "Сектори" },
  { to: "/#process", label: "​Функции" },
  { to: "/#compliance", label: "Съответствие" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-navy/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link to="/" onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-3">
          <Logo />
          <a
            href="https://im-development.imot.bg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden border-l border-border/60 pl-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold sm:inline-flex sm:flex-col sm:leading-tight"
          >
            <span>Powered by</span>
            <span className="font-semibold text-gold/90">IM Development</span>
          </a>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="transition-colors hover:text-gold">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-xs font-medium text-gold lg:inline-flex">
            <a href="https://lex.bg/laws/ldoc/2121934337" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ЗЗД</a>
            <span className="opacity-50">,</span>
            <a href="https://lex.bg/laws/ldoc/-14917630" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ТЗ</a>
            <span className="opacity-50">,</span>
            <a href="https://lex.bg/laws/ldoc/2135163904" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ЗУТ</a>
          </span>
          {user ? (
            <Link
              to="/account"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
            >
              <UserIcon className="h-4 w-4" /> Профил
            </Link>
          ) : (
            <Link
              to="/auth"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
            >
              <LogIn className="h-4 w-4" /> Вход
            </Link>
          )}
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
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
                <a href="https://lex.bg/laws/ldoc/2121934337" target="_blank" rel="noopener noreferrer" className="hover:underline">ЗЗД</a>
                <span className="opacity-50">,</span>
                <a href="https://lex.bg/laws/ldoc/-14917630" target="_blank" rel="noopener noreferrer" className="hover:underline">ТЗ</a>
                <span className="opacity-50">,</span>
                <a href="https://lex.bg/laws/ldoc/2135163904" target="_blank" rel="noopener noreferrer" className="hover:underline">ЗУТ</a>
              </span>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
