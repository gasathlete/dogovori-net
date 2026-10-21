import { useState, useRef, useEffect } from "react";
import { Menu, X, User as UserIcon, LogIn, ChevronDown } from "@/icons";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "./BrandLockup";
import { TEST_PERIOD_LABEL } from "@/lib/prelaunch";
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
// откриването на продукта. „Планове" стои непосредствено до нея: двата
// избора са едно решение, но остават отделни. Останалото е подредено по търсене.
const NAV = [
  { to: "/produkti", label: "Продукти" },
  { to: "/plans", label: "Планове" },
  { to: "/paketi", label: "Пакети" },
  { to: "/build", label: "Изготви документ" },
  { to: "/catalog", label: "Каталог" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/blog", label: "Блог" },
];

// Мобилното меню започва с „Продукти" и „Планове" като два отделни реда най-
// горе, следвани от двата основни изхода и профила. Всичко останало е в една
// свита група „Още". Профилът се появява точно веднъж.
const MOBILE_PRIMARY: { to: string; label: string }[] = [
  { to: "/produkti", label: "Продукти" },
  { to: "/plans", label: "Планове" },
  { to: "/catalog", label: "Каталог с шаблони" },
  { to: "/analiz", label: "Проверка на документ" },
  { to: "/build", label: "Създайте документ" },
  { to: "/account", label: "Профил" },
];

const MOBILE_MORE: { to: string; label: string }[] = [
  { to: "/paketi", label: "Пакети по сектор" },
  { to: "/komplekti", label: "Комплекти документи" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/blog", label: "Блог" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const guestRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
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
        "brand-header sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-border bg-background"
          : "border-b border-border/40 bg-background",
      )}
    >
      <div
        className={cn(
          // Възстановени пропорции на предишния мобилен хедър (68px, 64px при
          // скрол); десктоп височините остават непроменени.
          "container flex items-center justify-between gap-3 transition-[height] duration-300 xl:gap-6",
          scrolled ? "h-[76px]" : "h-[80px] xl:h-[92px]",
        )}
      >
        {/* Zone 1 — Brand */}
        <div className="flex min-w-0 items-center justify-self-start">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Договори.нет — начало"
          >
            <BrandLockup />
          </Link>
          <span
            data-testid="test-period-badge"
            className="ml-3 hidden shrink-0 border-l border-border pl-3 text-xs leading-4 text-muted-foreground sm:inline-flex"
          >
            {TEST_PERIOD_LABEL}
          </span>
        </div>

        {/* Zone 2 — Primary product navigation (centered) */}
        <nav aria-label="Основна навигация" className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex 2xl:gap-2">
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
                  "relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  "after:absolute after:inset-x-2.5 after:bottom-2 after:h-px after:bg-foreground after:transition-opacity",
                  active ? "text-foreground after:opacity-100" : "text-foreground/75 hover:text-foreground after:opacity-0 hover:after:opacity-60",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3 — Utility (helpers + account), separated by a hairline */}
        <div className="flex items-center justify-end gap-2 justify-self-end">
          <Button asChild className="header-catalog-action hidden min-h-11 px-4 text-sm 2xl:inline-flex"><Link to="/catalog">Намерете документ</Link></Button>
          {/* Helpers subgroup */}
          <div className="hidden items-center gap-1 xl:flex">
            <ThemeToggle />
          </div>

          {/* Divider between helpers and account */}
          <span
            aria-hidden="true"
            className="mx-1 hidden h-5 w-px bg-border/60 xl:block"
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
              className="relative hidden h-11 min-w-11 items-center justify-center gap-2 rounded-lg sm:inline-flex border border-gold/30 bg-gold/[0.08] px-4 text-[13px] font-semibold tracking-wide text-gold transition-colors hover:border-gold/50 hover:bg-gold/15"
            >
              {/* Под 640px профилът е в долната навигация — тук не се дублира. */}
              <UserIcon className="h-4 w-4" />
              <span>Профил</span>
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
              className="relative hidden xl:block"
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
            className="inline-flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-card/50 px-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold xl:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span>{open ? "Затвори" : "Меню"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Мобилна навигация"
          className="origin-top animate-accordion-down overflow-hidden border-t border-gold/20 bg-background xl:hidden"
        >
          <div className="container flex max-h-[calc(100dvh-68px)] flex-col gap-4 overflow-y-auto py-4">
            {(() => {
              const renderItem = (n: { to: string; label: string }) => {
                if (n.to === "__tools__") {
                  return (
                    <div key="tools" className="px-0">
                      <ToolsMenu variant="mobile" onNavigate={() => setOpen(false)} />
                    </div>
                  );
                }
                const to = n.to === "/account" && !user ? "/auth" : n.to;
                const active = isActive(to);
                return (
                  <Link
                    key={n.to}
                    to={to}
                    onClick={(e) => {
                      setOpen(false);
                      handleNav(to, e);
                    }}
                    {...prefetchHandlers(to)}
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
              };
              return (
                <>
                  <div className="flex flex-col gap-1" data-testid="mobile-menu-primary">
                    {MOBILE_PRIMARY.map(renderItem)}
                  </div>
                  <details className="rounded-lg border border-border/60" data-testid="mobile-menu-more">
                    <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-3.5 text-[14px] font-semibold text-foreground/80">
                      Още
                      <span aria-hidden="true" className="text-gold">›</span>
                    </summary>
                    <div className="flex flex-col gap-1 border-t border-border/50 p-2">
                      {MOBILE_MORE.map(renderItem)}
                      {/* Излизането от профила съществува точно веднъж — тук. */}
                      {user && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            void signOut();
                          }}
                          className="flex min-h-[48px] items-center gap-2 rounded-lg border border-transparent px-3.5 text-left text-[15px] font-medium text-muted-foreground transition-colors duration-200 hover:border-border/60 hover:text-foreground"
                        >
                          Изход
                        </button>
                      )}
                    </div>
                  </details>
                </>
              );
            })()}

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
