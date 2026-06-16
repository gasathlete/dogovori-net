import { useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Sparkles, FileText, Scale, Upload, Plus, Handshake, Layers, ArrowLeft } from "lucide-react";
import { AssistantChat } from "@/components/AssistantChat";
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
  const cap = freeQuota.aiMessagesCap;
  const used = freeQuota.aiMessagesUsed;
  const remaining = Math.max(0, cap - used);
  const unlimited = isPro || isTeam;

  useEffect(() => {
    document.title = "DogovaryAI · Workspace";
  }, []);

  // Logged-in users → use unified Console workspace
  useEffect(() => {
    if (user) {
      navigate("/console/assistant", { replace: true });
    }
  }, [user, navigate]);

  const handleThreadChange = (id: string | null) => {
    if (id && id !== threadId) {
      navigate(`/assistant/${id}`, { replace: false });
    } else if (!id && threadId) {
      navigate("/assistant", { replace: false });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Slim header */}
      <header className="flex items-center justify-between border-b border-border/40 bg-card/40 px-4 py-2 backdrop-blur-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Назад към сайта
        </Link>
        <div className="flex items-center gap-2">
          <img src="/dogovai-favicon.png" alt="DogovaryAI" className="h-6 w-6 rounded" />
          <span className="font-serif text-base font-bold">DogovaryAI</span>
          <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">
            Workspace
          </span>
        </div>
        <div className="text-right text-xs">
          {!user ? (
            <Link to="/auth" className="inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-gold/90 to-gold/70 px-3 py-1.5 font-semibold text-navy hover:brightness-110">
              <Sparkles className="h-3.5 w-3.5" /> Регистрация · 5 безпл. операции
            </Link>
          ) : unlimited ? (
            <span className="text-gold">{remaining}/{cap} операции · този месец</span>
          ) : (
            <span className="text-muted-foreground">
              <strong className="text-foreground">{remaining}</strong> / {cap} безпл. операции ·{" "}
              <Link to="/account?tab=subscription" className="text-gold hover:underline">Надгради</Link>
            </span>
          )}
        </div>
      </header>

      {/* Quick links bar */}
      <div className="border-b border-border/30 bg-muted/20">
        <div className="container flex flex-wrap gap-2 py-2">
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="group inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-gold/50 hover:bg-gold/5 hover:text-gold"
              title={q.desc}
            >
              <q.icon className="h-3.5 w-3.5 text-gold" />
              <span className="font-medium">{q.title}</span>
            </Link>
          ))}
          <Link
            to="/build?from=dogovaryai"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-gold/90 to-gold/70 px-3 py-1.5 text-xs font-semibold text-navy hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> Нов документ
          </Link>
        </div>
      </div>

      {/* Chat surface — full-height */}
      <main className="flex-1 overflow-hidden">
        <div className="container h-full max-w-6xl py-3">
          <AssistantChat
            key={threadId || "new"}
            threadId={threadId ?? null}
            onThreadChange={handleThreadChange}
          />
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
