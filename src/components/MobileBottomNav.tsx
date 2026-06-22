import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, FileText, User as UserIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { prefetchHandlers } from "@/lib/routePrefetch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AssistantChat } from "@/components/AssistantChat";
const logoImg = "/dogovai-favicon.png";

type Item = {
  to?: string;
  label: string;
  icon?: typeof Home;
  match: (path: string) => boolean;
  action?: "ai";
};

const ITEMS: Item[] = [
  { to: "/", label: "Начало", icon: Home, match: (p) => p === "/" },
  {
    to: "/catalog",
    label: "Каталог",
    icon: BookOpen,
    match: (p) => p.startsWith("/catalog") || p.startsWith("/kategoria") || p.startsWith("/shablon"),
  },
  { to: "/build", label: "Изготви", icon: FileText, match: (p) => p.startsWith("/build") || p.startsWith("/wizard") },
  { label: "DogovaryAI", match: () => false, action: "ai" },
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
  const [aiOpen, setAiOpen] = useState(false);

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
    <>
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
            const Icon = item.icon;
            const showDot = item.to === "/account" && user && unread > 0;

            if (item.action === "ai") {
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    aria-label="Отвори DogovaryAI"
                    className="relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-gold/80"
                  >
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-gold to-gold/80 shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] ring-1 ring-gold/40">
                      <img
                        src={logoImg}
                        alt=""
                        width={28}
                        height={28}
                        className="h-7 w-7 object-contain"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 text-[9px] font-bold tracking-[0.05em] text-gold">DogovaryAI</span>
                  </button>
                </li>
              );
            }

            const active = item.match(path);
            const to = !user && item.to === "/account" ? "/auth" : item.to!;
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
                  {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
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

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] max-h-[100dvh] rounded-t-2xl p-0 lg:hidden flex flex-col gap-0"
          style={{ overscrollBehavior: "contain" }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2.5 pt-safe">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-gold to-gold/80 ring-1 ring-gold/40">
                  <img src={logoImg} alt="" width={22} height={22} className="h-5 w-5 object-contain" aria-hidden="true" />
                </span>
                <SheetTitle className="text-sm font-semibold">DogovaryAI</SheetTitle>
              </div>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                aria-label="Затвори чата"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {aiOpen && <AssistantChat threadId={null} onThreadChange={() => {}} embedded compact />}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

