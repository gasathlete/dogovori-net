import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ConsoleProvider, useConsoleShortcuts, useConsoleStore, type ConsoleSection } from "@/hooks/useConsoleStore";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { ConsoleListColumn } from "@/components/console/ConsoleListColumn";
import { ConsoleTabBar } from "@/components/console/ConsoleTabBar";
import { ConsoleCanvas } from "@/components/console/ConsoleCanvas";
import { ConsoleFooter } from "@/components/console/ConsoleFooter";
import { Header } from "@/components/Header";
import { AssistantChat } from "@/components/AssistantChat";
import { FileText, Upload, Layers, Scale, Plus, LayoutDashboard, RotateCw, X } from "lucide-react";

const ASSISTANT_QUICK_LINKS = [
  { to: "/console/dashboard", icon: LayoutDashboard, label: "Табло" },
  { to: "/build?from=dogovaryai", icon: FileText, label: "Създай документ" },
  { to: "/analyze", icon: Upload, label: "Анализ" },
  { to: "/catalog", icon: Layers, label: "Шаблони" },
  { to: "/komplekti", icon: Scale, label: "Комплекти" },
];

const VALID_SECTIONS: ConsoleSection[] = [
  "assistant", "dashboard", "deals", "documents", "uploaded",
  "templates", "clients", "analyses", "signing", "team",
];

function ConsoleShell() {
  useConsoleShortcuts();
  const { state, setSection, toggleSidebar } = useConsoleStore();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const isAssistant = state.section === "assistant";
  const [rotateHintDismissed, setRotateHintDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem("console-rotate-hint-dismissed") === "1";
  });
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  // URL → store (one-way; sidebar navigates the URL, store follows)
  useEffect(() => {
    if (sectionParam && VALID_SECTIONS.includes(sectionParam as ConsoleSection)) {
      if (state.section !== sectionParam) setSection(sectionParam as ConsoleSection);
    }
  }, [sectionParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse sidebar on mobile (first mount only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768 && !state.sidebarCollapsed) {
      toggleSidebar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track portrait-mobile to show rotate hint
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      setIsPortraitMobile(window.innerWidth < 768 && window.innerHeight > window.innerWidth);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const dismissRotateHint = () => {
    setRotateHintDismissed(true);
    try { window.sessionStorage.setItem("console-rotate-hint-dismissed", "1"); } catch {}
  };
  const showRotateHint = isPortraitMobile && !rotateHintDismissed;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      {showRotateHint && (
        <div className="flex items-center gap-2 border-b border-gold/30 bg-gold/10 px-3 py-2 text-[12px] text-foreground md:hidden">
          <RotateCw className="h-3.5 w-3.5 shrink-0 text-gold" />
          <span className="flex-1 leading-tight">
            Завъртете екрана за по-добро изживяване в workspace.
          </span>
          <button
            type="button"
            onClick={dismissRotateHint}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="Затвори"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ height: showRotateHint ? "calc(100vh - 64px - 36px)" : "calc(100vh - 64px)" }}
      >
        <ConsoleSidebar />
        {isAssistant ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Workspace quick-access bar */}
            <div className="border-b border-border/40 bg-card/30 px-2 py-2 backdrop-blur-sm sm:px-3">
              <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ASSISTANT_QUICK_LINKS.map((q) => (
                  <Link
                    key={q.to}
                    to={q.to}
                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs font-medium text-foreground/80 shadow-[0_1px_0_hsl(var(--gold)/0.05)] transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:bg-gold/5 hover:text-gold hover:shadow-[0_6px_14px_-8px_hsl(var(--gold)/0.5)] active:translate-y-0"
                  >
                    <q.icon className="h-3.5 w-3.5 text-gold transition-transform group-hover:scale-110" />
                    <span>{q.label}</span>
                  </Link>
                ))}
                <Link
                  to="/build?from=dogovaryai"
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-gold to-gold/80 px-3 py-1.5 text-xs font-bold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_8px_22px_-6px_hsl(var(--gold)/0.7)] active:translate-y-0 active:scale-[0.98]"
                >
                  <Plus className="h-3.5 w-3.5" /> Нов документ
                </Link>
              </div>
            </div>
            <div className="flex flex-1 flex-col overflow-hidden p-2 sm:p-3">
              <AssistantChat embedded />
            </div>
          </div>
        ) : (
          <>
            <ConsoleListColumn />
            <div className="flex flex-1 flex-col overflow-hidden">
              <ConsoleTabBar />
              <ConsoleCanvas />
              <ConsoleFooter />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Console() {
  return (
    <>
      <Helmet>
        <title>Console · Dogovori.net</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <ConsoleProvider>
        <ConsoleShell />
      </ConsoleProvider>
    </>
  );
}
