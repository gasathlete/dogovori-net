import { useState } from "react";
import { Menu, X, User as UserIcon, LogIn } from "lucide-react";
import { Logo } from "./Logo";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { scrollToHash } from "@/lib/scrollToHash";
import { useScrolled } from "@/hooks/useScrolled";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/build", label: "Изготви документ" },
  { to: "/catalog", label: "Каталог" },
  { to: "/#sectors", label: "Сектори" },
  { to: "/blog", label: "Блог" },
  { to: "/#compliance", label: "Съответствие" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const scrolled = useScrolled(8);

  const handleNav = (to: string, e: React.MouseEvent) => {
    if (!to.includes("#")) return;
    e.preventDefault();
    setOpen(false);
    const [path, hash] = to.split("#");
    if (location.pathname === (path || "/")) {
      scrollToHash(hash);
    } else {
      navigate(path || "/");
      setTimeout(() => scrollToHash(hash), 80);
    }
  };

  const isActive = (to: string) => {
    if (to.includes("#")) return false;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-xl transition-all duration-300",
        scrolled ? "border-gold/15 bg-navy/95 shadow-soft" : "border-border/60 bg-navy/80"
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link to="/" onClick={() => setOpen(false)} className="flex min-w-0 items-center">
            <Logo compact />
          </Link>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={(e) => handleNav(n.to, e)} className="transition-colors hover:text-gold">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden h-9 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 text-xs font-medium text-gold lg:inline-flex">
            <a href="https://lex.bg/laws/ldoc/2121934337" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ЗЗД</a>
            <span className="opacity-50">,</span>
            <a href="https://lex.bg/laws/ldoc/-14917630" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ТЗ</a>
            <span className="opacity-50">,</span>
            <a href="https://lex.bg/laws/ldoc/2135163904" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold/70 hover:underline">ЗУТ</a>
          </span>
          {user ? (
            <Link
              to="/account"
              aria-label="Профил"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 text-xs font-medium text-gold transition-colors hover:bg-gold/20 sm:h-9 sm:px-3"
            >
              <UserIcon className="h-4 w-4" /> <span className="hidden sm:inline">Профил</span>
            </Link>
          ) : (
            <Link
              to="/auth"
              aria-label="Вход"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 text-xs font-medium text-gold transition-colors hover:bg-gold/20 sm:h-9 sm:px-3"
            >
              <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Вход</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Затвори менюто" : "Отвори менюто"}
            aria-expanded={open}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border/60 bg-card/40 text-foreground transition-colors hover:border-gold/50 hover:text-gold md:hidden"
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
                onClick={(e) => {
                  setOpen(false);
                  handleNav(n.to, e);
                }}
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
