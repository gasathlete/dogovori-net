import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDeals } from "@/hooks/useDeals";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import {
  Briefcase,
  FileText,
  FileUp,
  PenSquare,
  Plus,
  FilePlus2,
  Building2,
  Home,
  Wrench,
  ScrollText,
  Shield,
  UploadCloud,
} from "@/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function useCountUp(target: number, duration = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target <= 0) { setN(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function MiniKpi({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: boolean }) {
  const n = useCountUp(value);
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5 transition-all hover:-translate-y-0.5 hover:border-gold/40">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", accent ? "bg-gold/10 text-gold" : "bg-muted/40 text-muted-foreground")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-light leading-none tracking-tight text-foreground">{n}</div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

interface TemplateTile {
  icon: any;
  title: string;
  desc: string;
  href: string;
  accent: string;
}

const TEMPLATES: TemplateTile[] = [
  { icon: FilePlus2, title: "Празен документ", desc: "Започни от нула, без шаблон или бланка.", href: "/build?from=console", accent: "from-slate-500/15 to-slate-500/5 text-slate-300" },
  { icon: Building2, title: "Трудов договор", desc: "Срочен или безсрочен с типови клаузи.", href: "/shablon/truhdov-dogovor", accent: "from-emerald-500/15 to-emerald-500/5 text-emerald-300" },
  { icon: Home, title: "Договор за наем", desc: "На жилищен или нежилищен имот.", href: "/shablon/dogovor-za-naem", accent: "from-amber-500/15 to-amber-500/5 text-amber-300" },
  { icon: Wrench, title: "Договор за услуги", desc: "За предоставяне на услуги между страни.", href: "/shablon/dogovor-za-usluga", accent: "from-sky-500/15 to-sky-500/5 text-sky-300" },
  { icon: ScrollText, title: "Пълномощно", desc: "Общо или специално за представителство.", href: "/shablon/palnomoshtno", accent: "from-violet-500/15 to-violet-500/5 text-violet-300" },
  { icon: Shield, title: "NDA", desc: "Двустранно или едностранно споразумение за поверителност.", href: "/shablon/nda-dogovor-za-konfidentsialnost", accent: "from-rose-500/15 to-rose-500/5 text-rose-300" },
];

const FORMAT_PILLS = ["PDF", "DOC", "DOCX", "TXT", "PNG", "JPG"];

export function DashboardPane() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { deals } = useDeals();
  const { openTab } = useConsoleStore();
  const [docsCount, setDocsCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: d }, { count: u }] = await Promise.all([
        supabase.from("saved_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("uploaded_contracts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setDocsCount(d ?? 0);
      setUploadedCount(u ?? 0);
    })();
  }, [user]);

  const signingCount = deals.filter((d) => d.status === "signing").length;
  const activeCount = deals.filter((d) => d.status === "active" || d.status === "negotiating").length;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    toast.info(`Качване на „${files[0].name}"...`);
    navigate("/analyze");
  };

  return (
    <div className="relative mx-auto max-w-6xl space-y-8 p-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-gold/5 to-transparent" />

      {/* Header */}
      <div className="animate-fade-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gold">Workspace</span>
          </div>
          <h1 className="font-serif text-3xl font-bold leading-tight">Започни нов документ</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Започни от нула, избери шаблон или качи готова бланка.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniKpi label="Активни" value={activeCount} icon={Briefcase} accent />
          <MiniKpi label="За подпис" value={signingCount} icon={PenSquare} />
          <MiniKpi label="Документи" value={docsCount} icon={FileText} accent />
          <MiniKpi label="Качени" value={uploadedCount} icon={FileUp} />
        </div>
      </div>

      {/* Template tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t, i) => (
          <a
            key={t.title}
            href={t.href}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:bg-card/60 hover:shadow-[0_12px_28px_-12px_hsl(var(--gold)/0.4)]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gold/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
            <div className="flex items-start gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-border/40 transition-transform group-hover:scale-110", t.accent)}>
                <t.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* "или" divider */}
      <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border/60" />
        <span>или</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border/60" />
      </div>

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all",
          dragOver
            ? "border-gold bg-gold/10 scale-[1.01]"
            : "border-border/60 bg-card/20 hover:border-gold/50 hover:bg-card/40",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20 transition-transform group-hover:scale-110">
          <UploadCloud className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Качи документи</h3>
        <p className="mt-1 text-xs text-muted-foreground">Плъзнете файлове или папка тук</p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {FORMAT_PILLS.map((f) => (
            <span key={f} className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Recent deals */}
      {deals.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Последни сделки</h2>
            <button type="button" onClick={() => navigate("/console/deals")} className="text-[10px] font-bold uppercase tracking-wider text-gold hover:text-gold/80">
              Виж всички →
            </button>
          </div>
          <ul className="space-y-1.5">
            {deals.slice(0, 5).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openTab({ kind: "deal", entityId: d.id, title: d.title })}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40 group-hover:border-gold/30">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground">{d.counterparty ?? "—"}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    d.status === "signing" ? "bg-gold shadow-[0_0_6px_hsl(var(--gold)/0.8)]"
                    : d.status === "active" || d.status === "negotiating" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-muted-foreground/40",
                  )} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
