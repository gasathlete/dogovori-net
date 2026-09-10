import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, FileText, User as UserIcon } from "@/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { prefetchHandlers } from "@/lib/routePrefetch";

const dogovaiIcon = "/dogovai-favicon.png";

type Item = {
  to: string;
  label: string;
  icon?: typeof Home;
  /** Брандовият знак на DogovaryAI вместо иконка. */
  brandMark?: string;
  match: (path: string) => boolean;
};

/**
 * Петте основни изхода на телефон. Продуктите се откриват от ранния ред в
 * hero-а и от менюто, затова тук стоят Начало, Каталог, Изготви, DogovaryAI и
 * Профил.
 */
export const MOBILE_NAV_ITEMS: Item[] = [
  { to: "/", label: "Начало", icon: Home, match: (p) => p === "/" },
  { to: "/catalog", label: "Каталог", icon: BookOpen, match: (p) => p.startsWith("/catalog") },
  { to: "/build", label: "Изготви", icon: FileText, match: (p) => p.startsWith("/build") || p.startsWith("/wizard") },
  {
    to: "/assistant",
    label: "DogovaryAI",
    brandMark: dogovaiIcon,
    match: (p) => p.startsWith("/assistant"),
  },
  {
    to: "/account",
    label: "Профил",
    icon: UserIcon,
    match: (p) => p.startsWith("/account") || p.startsWith("/auth"),
  },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { count: unread } = useUnreadNotifications();
  const visible = useHideOnScroll(10);

  const path = location.pathname;
  if (
    path.startsWith("/admin") ||
    path.startsWith("/sign/") ||
    path.startsWith("/signing/") ||
    path.startsWith("/checkout/") ||
    path.startsWith("/wizard") ||
    path.startsWith("/build")
  ) {
    return null;
  }

  return (
    <nav
      aria-label="Основна мобилна навигация"
      data-testid="mobile-bottom-nav"
      className={cn(
        "lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md",
        "transition-transform duration-300 ease-out pb-safe",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      style={{ touchAction: "manipulation" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match(path);
          const showDot = item.to === "/account" && user && unread > 0;
          const to = !user && item.to === "/account" ? "/auth" : item.to;
          return (
            <li key={item.label} className="min-w-0">
              <Link
                to={to}
                {...prefetchHandlers(to)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-[58px] min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 text-[9.5px] font-semibold leading-tight tracking-tight transition-colors",
                  active ? "text-gold" : "text-muted-foreground hover:text-gold/80",
                )}
              >
                <span className="relative">
                  {Icon ? (
                    <Icon className="h-[20px] w-[20px]" aria-hidden="true" />
                  ) : (
                    <img
                      src={item.brandMark}
                      alt=""
                      aria-hidden="true"
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "h-[20px] w-[20px] rounded-full ring-1",
                        active ? "ring-gold/70" : "ring-border/70",
                      )}
                    />
                  )}
                  {showDot && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                    />
                  )}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-[2px] rounded-b bg-gold"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
