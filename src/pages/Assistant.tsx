import { useEffect } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, FileText, Scale, Upload, Plus, Handshake, Layers, ArrowLeft, MessageSquarePlus } from "lucide-react";
import { AssistantChat } from "@/components/AssistantChat";
import { PaidOnlyOverlay } from "@/components/paywall/PaidOnlyOverlay";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";

const QUICK_LINKS = [
  { to: "/build", icon: FileText, title: "Създаване на документ", desc: "Wizard за индивидуален договор." },
  { to: "/analyze", icon: Upload, title: "Анализ на документ", desc: "Качете PDF/DOCX за AI преглед." },
  { to: "/catalog", icon: Layers, title: "Каталог шаблони", desc: "600+ готови шаблона." },
  { to: "/komplekti", icon: Scale, title: "Комплекти", desc: "Пакети за често срещани казуси." },
];

export default function AssistantPage() {
  const { user } = useAuth();
  const { isPro, isTeam, freeQuota } = useIsPro();
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromConsole = params.get("from") === "console";
  const cap = freeQuota.aiMessagesCap;
  const used = freeQuota.aiMessagesUsed;
  const remaining = Math.max(0, cap - used);
  const unlimited = isPro || isTeam;

  useEffect(() => {
    document.title = fromConsole ? "DogovaryAI · Разширен изглед" : "DogovaryAI · Workspace";
  }, [fromConsole]);

  // Logged-in users → use unified Console workspace (unless explicitly opened from workspace as "expanded")
  useEffect(() => {
    if (user && !fromConsole) {
      navigate("/console/assistant", { replace: true });
    }
  }, [user, fromConsole, navigate]);

  const handleThreadChange = (id: string | null) => {
    if (id && id !== threadId) {
      navigate(`/assistant/${id}`, { replace: false });
    } else if (!id && threadId) {
      navigate("/assistant", { replace: false });
    }
  };

  const usagePct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-card/70 backdrop-blur-xl">
        <div className="container flex items-center justify-between gap-3 py-2.5">
          {fromConsole ? (
            <Link
              to="/console/assistant"
              className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
              title="Назад към Workspace"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Workspace</span>
            </Link>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Назад към сайта</span>
            </Link>
          )}

          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-gold/40 bg-gradient-to-br from-gold/25 to-gold/5">
              <img
                src="/dogovai-favicon.png"
                alt=""
                className="h-full w-full object-contain p-1"
                width={36}
                height={36}
              />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-400"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-base font-bold tracking-tight text-foreground">
                DogovaryAI
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-gold/80">
                Правен AI · Workspace
              </span>
            </div>
          </div>

          <div className="text-right text-xs">
            {!user ? (
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-gold to-gold/80 px-3.5 py-1.5 font-semibold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:brightness-110"
              >
                <Sparkles className="h-3.5 w-3.5" /> Регистрация · 5 безпл.
              </Link>
            ) : unlimited ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-medium text-gold">
                <Sparkles className="h-3 w-3" />
                {remaining}/{cap} операции
              </span>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{remaining}</strong> / {cap} безпл. ·{" "}
                  <Link to="/account?tab=subscription" className="font-semibold text-gold hover:underline">
                    Надгради
                  </Link>
                </span>
                <span className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full bg-gradient-to-r from-gold to-gold/70 transition-all"
                    style={{ width: `${usagePct}%` }}
                  />
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Quick links bar */}
      <div className="border-b border-border/30 bg-gradient-to-b from-muted/20 to-transparent">
        <div className="container flex flex-wrap items-center gap-2 py-2.5">
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="group inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-3 py-1.5 text-xs text-foreground/80 transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:bg-gold/5 hover:text-gold hover:shadow-sm"
              title={q.desc}
            >
              <q.icon className="h-3.5 w-3.5 text-gold" />
              <span className="font-medium">{q.title}</span>
            </Link>
          ))}
          <Link
            to="/build?from=dogovaryai"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-gold to-gold/80 px-3.5 py-1.5 text-xs font-semibold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> Нов документ
          </Link>
        </div>
      </div>

      {/* Chat surface — full-height */}
      <main className="flex-1 overflow-hidden">
        <div className="container h-full max-w-6xl py-3">
          {user && !unlimited ? (
            <PaidOnlyOverlay
              pillar="assistant"
              headline="AI Асистент — само за платени планове"
              sub="Пробва демо съобщението. Продължи с неограничен правен чат, цитати и анализ на договори."
              ctaLabel="Отключи AI Асистента"
              minHeight="60vh"
            >
              <AssistantChat
                key={threadId || "new"}
                threadId={threadId ?? null}
                onThreadChange={handleThreadChange}
              />
            </PaidOnlyOverlay>
          ) : (
            <AssistantChat
              key={threadId || "new"}
              threadId={threadId ?? null}
              onThreadChange={handleThreadChange}
            />
          )}
        </div>
      </main>


      {/* Footer hint */}
      <footer className="border-t border-border/30 bg-muted/20 px-4 py-2 text-center text-[11px] text-muted-foreground">
        <Handshake className="mr-1 inline h-3 w-3 text-gold" />
        DogovaryAI е AI асистент, не адвокат. Цитатите следват йерархията Конституция → ЕС → ЗЗД/ТЗ/ЗУТ/КТ →
        наредби → ТР на ВКС/ВАС. (Обща информация, не правен съвет.)
      </footer>
    </div>
  );
}
