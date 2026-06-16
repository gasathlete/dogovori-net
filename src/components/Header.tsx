import { useState } from "react";
import { Menu, X, User as UserIcon, LogIn } from "lucide-react";
import { Logo } from "./Logo";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { scrollToHash } from "@/lib/scrollToHash";
import { useScrolled } from "@/hooks/useScrolled";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ToolsMenu } from "@/components/calculators/ToolsMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useFreeJourneyStage } from "@/hooks/useFreeJourneyStage";
import { trackEvent } from "@/lib/analytics";
import { Crown } from "lucide-react";



const NAV = [
  { to: "/build", label: "Изготви документ" },
  { to: "/catalog", label: "Каталог" },
  { to: "/blog", label: "Блог" },
  { to: "__tools__", label: "Инструменти" },
  { to: "/plans", label: "Цени" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { count: unreadCount } = useUnreadNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const scrolled = useScrolled(8);
  const { isPro, stage, opsLeft } = useFreeJourneyStage();
  const showProBadge = !isPro && stage >= 2;

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
        "sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-gold/15 bg-background shadow-soft"
          : "border-border/40 bg-background",
      )}
    >

      <div className="container flex h-14 items-center justify-between gap-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-4">
        {/* Brand */}
        <div className="flex min-w-0 items-center justify-self-start">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center"
          >
            <Logo compact />
          </Link>
        </div>

        {/* Primary nav — centered column in the header grid, aligns with hero diamond */}
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
                className={cn(
                  "group relative whitespace-nowrap text-[13px] font-medium tracking-wide transition-colors",
                  active
                    ? "text-gold"
                    : "text-foreground/75 hover:text-gold",
                )}
              >
                {n.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -bottom-1.5 left-0 h-px bg-gold transition-all duration-300",
                    active ? "w-full opacity-100" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-60",
                  )}
                />
              </Link>
            );
          })}
        </nav>


        {/* Actions */}
        <div className="flex items-center justify-end gap-2 justify-self-end">
          <ThemeToggle className="hidden sm:inline-flex" />



          {showProBadge && (
            <button
              type="button"
              onClick={() => {
                trackEvent("tease_clicked", { channel: "header_badge", stage });
                window.dispatchEvent(
                  new CustomEvent("dogovori:open-pro-dialog", {
                    detail: { trigger: stage === 3 ? "ops_exhausted" : "generic" },
                  }),
                );
              }}
              className={cn(
                "hidden md:inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-[13px] font-semibold uppercase tracking-wider backdrop-blur-sm transition-all",
                stage === 3
                  ? "border-red-400/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                  : "border-gold/30 bg-gold/10 text-gold hover:border-gold/50 hover:bg-gold/20 hover:shadow-[0_0_12px_hsl(var(--gold)/0.12)]",
              )}
              aria-label="Надгради до Предприемач"
            >
              <Crown className="h-5 w-5" />
              {stage === 3 ? "Лимит · Надгради" : `${opsLeft} безпл.`}
            </button>
          )}

          {/* <LanguageSwitcher className="hidden sm:block" /> */}
          {user ? (
            <Link
              to="/account"
              aria-label={unreadCount > 0 ? `Профил (${unreadCount} непрочетени известия)` : "Профил"}
              className="relative inline-flex h-11 items-center gap-2.5 rounded-lg border border-gold/30 bg-gold/[0.08] px-5 text-[13px] font-semibold tracking-wide text-gold backdrop-blur-sm transition-all hover:border-gold/50 hover:bg-gold/15 hover:shadow-[0_0_12px_hsl(var(--gold)/0.12)]"
            >
              <UserIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Профил</span>
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-navy"
                />
              )}
            </Link>
          ) : (
            <Link
              to="/auth"
              aria-label="Влезте"
              className="inline-flex h-11 items-center gap-2.5 rounded-lg bg-gradient-to-b from-gold/90 to-gold/70 px-5 text-[13px] font-bold tracking-widest text-navy shadow-[0_0_16px_hsl(var(--gold)/0.25)] transition-all hover:brightness-110 hover:shadow-[0_0_24px_hsl(var(--gold)/0.35)] active:scale-[0.98]"
            >
              <LogIn className="h-5 w-5" />
              <span className="hidden sm:inline">Влезте</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Затвори менюто" : "Отвори менюто"}
            aria-expanded={open}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/60 bg-card/40 text-foreground backdrop-blur-sm transition-colors hover:border-gold/50 hover:text-gold lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

        </div>
      </div>

      {open && (
        <nav className="origin-top animate-accordion-down overflow-hidden border-t border-border/60 bg-background lg:hidden">
          <div className="container flex flex-col py-3">
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
            <div className="mt-2 border-t border-border/60 pt-2">
              <ToolsMenu variant="mobile" onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-3">
              <ThemeToggle />
              <span className="text-xs text-muted-foreground">Theme</span>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

