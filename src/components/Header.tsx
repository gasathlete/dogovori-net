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

// „Продукти" е първата основна навигационна точка — оттам започва
// откриването на продукта. Останалото е подредено по търсене.
const NAV = [
  { to: "/produkti", label: "Продукти" },
  { to: "/build", label: "Изготви документ" },
  { to: "/catalog", label: "Каталог" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/blog", label: "Блог" },
];

// Off-header links — surfaced only inside the mobile menu and via contextual
// upgrade prompts. Not shown on the desktop bar to keep it uncluttered.
const RESOURCES = [{ to: "/plans", label: "Планове" }];

// Мобилното меню започва с точно същите четири основни изхода като долната
// навигация. Всичко останало е в една свита група „Още".
const MOBILE_PRIMARY: { to: string; label: string }[] = [
  { to: "/produkti", label: "Продукти" },
  { to: "/analiz", label: "Качи договор" },
  { to: "/build", label: "Изготви документ" },
  { to: "/account", label: "Профил" },
];

const MOBILE_MORE: { to: string; label: string }[] = [
  { to: "/catalog", label: "Каталог с шаблони" },
  { to: "/komplekti", label: "Комплекти документи" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/blog", label: "Блог" },
  ...RESOURCES,
];

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
          ? "bg-background lg:bg-background/97 lg:supports-[backdrop-filter]:bg-background/88 lg:backdrop-blur-xl border-b border-gold/15 shadow-soft"
          : "border-b border-border/40 bg-background",
      )}
    >
      <div
        className={cn(
          "container flex items-center justify-between gap-3 transition-[height] duration-300 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6",
          scrolled ? "h-16 lg:h-14" : "h-[68px] lg:h-16",
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
                  "relative whitespace-nowrap py-1 text-[13px] font-medium tracking-wide transition-colors",
                  "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gold after:transition-opacity",
                  active ? "text-gold after:opacity-100" : "text-foreground/75 hover:text-gold after:opacity-0",
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
            <div
              ref={guestRef}
              className="relative hidden lg:block"
              onMouseEnter={() => setGuestOpen(true)}
              onMouseLeave={() => setGuestOpen(false)}
            >
              <button
                type="button"
                onClick={() => setGuestOpen((v) => !v)}
                onFocus={() => setGuestOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setGuestOpen(false);
                }}
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
                <div className="absolute right-0 top-full h-2 w-56" aria-hidden="true" />
              )}
              {guestOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
                  style={{ marginTop: 8 }}
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
            className="inline-flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-card/50 px-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span>{open ? "Затвори" : "Меню"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Мобилна навигация"
          className="origin-top animate-accordion-down overflow-hidden border-t border-gold/20 bg-background lg:hidden"
        >
          <div className="container flex max-h-[calc(100dvh-68px)] flex-col gap-5 overflow-y-auto py-5">
            {MOBILE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                  {group.title}
                </p>
                <div className="flex flex-col gap-1">
                  {group.items.map((n) => {
                    if (n.to === "__tools__") {
                      return (
                        <div key="tools" className="px-0">
                          <ToolsMenu variant="mobile" onNavigate={() => setOpen(false)} />
                        </div>
                      );
                    }
                    const active = isActive(n.to);
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={(e) => {
                          setOpen(false);
                          handleNav(n.to, e);
                        }}
                        {...prefetchHandlers(n.to)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[48px] items-center justify-between rounded-lg border px-3.5 text-[15px] font-medium transition-colors",
                          active
                            ? "border-gold/50 bg-gold/[0.1] text-gold"
                            : "border-transparent text-foreground/85 hover:border-gold/30 hover:bg-gold/[0.05] hover:text-gold",
                        )}
                      >
                        <span>{n.label}</span>
                        {active && (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/80">
                            тук сте
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Профил */}
            <div>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                Профил
              </p>
              <div className="flex flex-col gap-1">
                {user ? (
                  <Link
                    to="/account"
                    onClick={() => setOpen(false)}
                    {...prefetchHandlers("/account")}
                    className="flex min-h-[48px] items-center rounded-lg border border-gold/40 bg-gold/[0.08] px-3.5 text-[15px] font-semibold text-gold"
                  >
                    Моят профил
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/auth"
                      onClick={() => setOpen(false)}
                      className="flex min-h-[48px] items-center rounded-lg border border-border/60 px-3.5 text-[15px] font-medium text-foreground/85"
                    >
                      Вход
                    </Link>
                    <Link
                      to="/auth?mode=signup"
                      onClick={() => setOpen(false)}
                      className="flex min-h-[48px] items-center rounded-lg border border-gold/40 bg-gold/[0.08] px-3.5 text-[15px] font-semibold text-gold"
                    >
                      Регистрация — без карта
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Настройки */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3.5 py-2.5">
              <span className="text-sm text-muted-foreground">Тема</span>
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
