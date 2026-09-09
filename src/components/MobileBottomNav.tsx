import { Link, useLocation } from "react-router-dom";
import { Package, FileUp, FileText, User as UserIcon } from "@/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { prefetchHandlers } from "@/lib/routePrefetch";

type Item = {
  to: string;
  label: string;
  icon: typeof Package;
  match: (path: string) => boolean;
};

/**
 * Точно четири основни изхода. Каталогът и DogovaryAI остават достъпни от
 * менюто/страниците, но не се борят за внимание тук. Началото е през логото.
 */
export const MOBILE_NAV_ITEMS: Item[] = [
  { to: "/produkti", label: "Продукти", icon: Package, match: (p) => p.startsWith("/produkti") },
  { to: "/analiz", label: "Качи", icon: FileUp, match: (p) => p.startsWith("/analiz") },
  { to: "/build", label: "Изготви", icon: FileText, match: (p) => p.startsWith("/build") || p.startsWith("/wizard") },
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
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match(path);
          const showDot = item.to === "/account" && user && unread > 0;
          const to = !user && item.to === "/account" ? "/auth" : item.to;
          return (
            <li key={item.label}>
              <Link
                to={to}
                {...prefetchHandlers(to)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-[58px] min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide transition-colors",
                  active ? "text-gold" : "text-muted-foreground hover:text-gold/80",
                )}
              >
                <span className="relative">
                  <Icon className="h-[21px] w-[21px]" aria-hidden="true" />
                  {showDot && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                    />
                  )}
                </span>
                <span>{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 top-0 h-[2px] rounded-b bg-gold"
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
