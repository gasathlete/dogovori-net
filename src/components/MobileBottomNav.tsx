import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, Bot, FolderOpen, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { prefetchHandlers } from "@/lib/routePrefetch";

type Item = {
  to: string;
  label: string;
  icon: typeof Home;
  match: (path: string) => boolean;
  action?: () => void;
};

const ITEMS: Item[] = [
  { to: "/", label: "Начало", icon: Home, match: (p) => p === "/" },
  { to: "/catalog", label: "Каталог", icon: BookOpen, match: (p) => p.startsWith("/catalog") || p.startsWith("/kategoria") || p.startsWith("/shablon") },
  { to: "/assistant", label: "AI", icon: Bot, match: (p) => p.startsWith("/assistant") },
  { to: "/console", label: "Моите", icon: FolderOpen, match: (p) => p.startsWith("/console") || p.startsWith("/document") || p.startsWith("/uploaded") },
  { to: "/account", label: "Профил", icon: UserIcon, match: (p) => p.startsWith("/account") || p.startsWith("/auth") },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { count: unread } = useUnreadNotifications();
  const visible = useHideOnScroll(10);

  // Hide on focused-task and admin/full-screen routes
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
      className={cn(
        "lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md",
        "transition-transform duration-300 ease-out",
        "pb-safe",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      style={{ touchAction: "manipulation" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(path);
          const Icon = item.icon;
          const to = !user && item.to === "/account" ? "/auth" : item.to;
          const showDot = item.to === "/account" && user && unread > 0;
          return (
            <li key={item.label}>
              <Link
                to={to}
                {...prefetchHandlers(to)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  active ? "text-gold" : "text-muted-foreground hover:text-gold/80",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
                {showDot && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1/2 top-1.5 ml-3 h-2 w-2 -translate-x-[-10px] rounded-full bg-red-500 ring-2 ring-background"
                  />
                )}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-gold"
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
