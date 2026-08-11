import { useState, useRef, useEffect } from "react";
import { Menu, X, User as UserIcon, LogIn, ChevronDown } from "@/icons";
import { Logo } from "./Logo";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { scrollToHash } from "@/lib/scrollToHash";
import { useScrolled } from "@/hooks/useScrolled";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { cn } from "@/lib/utils";
import { ToolsMenu } from "@/components/calculators/ToolsMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prefetchHandlers } from "@/lib/routePrefetch";

// Ordered from most-searched to least-searched. Kept intentionally short.
const NAV = [
  { to: "/build", label: "Изготви документ" },
  { to: "/catalog", label: "Каталог" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/blog", label: "Блог" },
];

// Off-header links — surfaced only inside the mobile menu and via contextual
// upgrade prompts. Not shown on the desktop bar to keep it uncluttered.
const RESOURCES = [{ to: "/plans", label: "Планове" }];

export function Header() {
  const [open, setOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const guestRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { count: unreadCount } = useUnreadNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const scrolled = useScrolled(8);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) setGuestOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "supports-[backdrop-filter]:bg-background/88 bg-background/97 backdrop-blur-xl border-b border-gold/15 shadow-soft"
          : "border-b border-border/40 bg-background",
      )}
    >
      <div
        className={cn(
          "container flex items-center justify-between gap-3 transition-[height] duration-300 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6",
          scrolled ? "h-14" : "h-16",
        )}
      >
        {/* Zone 1 — Brand */}
        <div className="flex min-w-0 items-center justify-self-start">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center"
          >
            <Logo compact />
          </Link>
        </div>

        {/* Zone 2 — Primary product navigation (centered) */}
        <nav className="hidden items-center gap-5 justify-self-center lg:flex xl:gap-7">
          {NAV.map((n) => {
            if (n.to === "__tools__") {
              return <ToolsMenu key="tools" variant="desktop" />;
            }
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={(e) => handleNav(n.to, e)}
                {...prefetchHandlers(n.to)}
                className={cn(
                  "whitespace-nowrap text-[13px] font-medium tracking-wide transition-colors",
                  active ? "text-gold" : "text-foreground/75 hover:text-gold",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3 — Utility (helpers + account), separated by a hairline */}
        <div className="flex items-center justify-end gap-2 justify-self-end">
          {/* Helpers subgroup */}
          <div className="hidden items-center gap-1 lg:flex">
            <ThemeToggle />
          </div>

          {/* Divider between helpers and account */}
          <span
            aria-hidden="true"
            className="mx-1 hidden h-5 w-px bg-border/60 lg:block"
          />

          {/* Account subgroup */}
          {user ? (
            <Link
              to="/account"
              {...prefetchHandlers("/account")}
              aria-label={
                unreadCount > 0
                  ? `Профил (${unreadCount} непрочетени известия)`
                  : "Профил"
              }
              className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-gold/30 bg-gold/[0.08] px-4 text-[13px] font-semibold tracking-wide text-gold transition-colors hover:border-gold/50 hover:bg-gold/15"
            >
              <UserIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Профил</span>
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-navy"
                />
              )}
            </Link>
          ) : (
            <div ref={guestRef} className="relative">
              <button
                type="button"
                onClick={() => setGuestOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={guestOpen}
                aria-label="Влезте"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/40 bg-transparent px-4 text-[13px] font-semibold tracking-wide text-foreground transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Влезте</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    guestOpen && "rotate-180",
                  )}
                />
              </button>
              {guestOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
                >
                  <Link
                    to="/auth"
                    role="menuitem"
                    onClick={() => setGuestOpen(false)}
                    {...prefetchHandlers("/auth")}
                    className="block px-4 py-2.5 text-sm hover:bg-accent"
                  >
                    Вход
                  </Link>
                  <Link
                    to="/auth?mode=signup"
                    role="menuitem"
                    onClick={() => setGuestOpen(false)}
                    {...prefetchHandlers("/auth")}
                    className="block px-4 py-2.5 text-sm hover:bg-accent"
                  >
                    Регистрация
                  </Link>
                  <div className="my-1 h-px bg-border/60" />
                  <Link
                    to="/plans"
                    role="menuitem"
                    onClick={() => setGuestOpen(false)}
                    {...prefetchHandlers("/plans")}
                    className="block px-4 py-2.5 text-sm hover:bg-accent"
                  >
                    Планове и цени
                  </Link>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Затвори менюто" : "Отвори менюто"}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-card/40 text-foreground transition-colors hover:border-gold/50 hover:text-gold lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="origin-top animate-accordion-down overflow-hidden border-t border-border/60 bg-background lg:hidden">
          <div className="container flex flex-col gap-4 py-4">
            {/* Group 1 — Продукт */}
            <div>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                Продукт
              </p>
              <div className="flex flex-col">
                {NAV.filter((n) => n.to !== "__tools__").map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={(e) => {
                      setOpen(false);
                      handleNav(n.to, e);
                    }}
                    className="rounded-md px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-gold/5 hover:text-gold"
                  >
                    {n.label}
                  </Link>
                ))}
                <div className="mt-1">
                  <ToolsMenu variant="mobile" onNavigate={() => setOpen(false)} />
                </div>
              </div>
            </div>

            {/* Group 2 — Ресурси */}
            <div>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                Ресурси
              </p>
              <div className="flex flex-col">
                {RESOURCES.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-gold/5 hover:text-gold"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Group 3 — Настройки */}
            <div>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                Настройки
              </p>
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Тема</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
