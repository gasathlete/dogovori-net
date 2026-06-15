import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDeals } from "@/hooks/useDeals";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { Briefcase, FileText, FileUp, PenSquare, Plus, ArrowRight, Library, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

// Mini count-up
function useCountUp(target: number, duration = 800) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target <= 0) { setN(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

type Spark = "wave" | "rising" | "bar" | "flat";

function KpiTile({
  label,
  value,
  icon: Icon,
  spark = "flat",
  accent = false,
}: {
  label: string;
  value: number;
  icon: any;
  spark?: Spark;
  accent?: boolean;
}) {
  const n = useCountUp(value);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-3.5 transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-card/60 hover:shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.35)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gold/5 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="mb-2 flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accent ? "text-gold" : "text-muted-foreground/60")} />
      </div>
      <div className="text-2xl font-light leading-none tracking-tight text-foreground">{n}</div>
      <div className="mt-2.5 h-4 w-full">
        {spark === "wave" && (
          <svg viewBox="0 0 100 20" className="h-full w-full fill-none stroke-gold opacity-50">
            <path d="M0 15 Q 10 5, 20 12 T 40 8 T 60 15 T 80 10 T 100 12" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {spark === "rising" && (
          <svg viewBox="0 0 100 20" className="h-full w-full fill-none stroke-gold opacity-60">
            <path d="M0 16 L 20 13 L 40 14 L 60 8 L 80 9 L 100 4" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {spark === "bar" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
            <div className="h-full bg-gold/60 transition-all duration-700" style={{ width: `${Math.min(100, value * 6)}%` }} />
          </div>
        )}
        {spark === "flat" && <div className="h-1 w-full rounded-full bg-muted/30" />}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "signing"
      ? "bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.8)]"
      : status === "active" || status === "negotiating"
        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
        : "bg-muted-foreground/40";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cls)} />;
}

export function DashboardPane() {
  const { user } = useAuth();
  const { deals } = useDeals();
  const { openTab, setSection } = useConsoleStore();
  const [docsCount, setDocsCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);

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

  return (
    <div className="relative mx-auto max-w-6xl space-y-7 p-6">
      {/* Ambient bottom glow */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-gold/5 to-transparent" />

      {/* Header */}
      <div className="animate-fade-in">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gold">Workspace</span>
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight">Архитект на сделките</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Работен плот с табове и multitasking за вашите документи и сделки.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Активни" value={activeCount} icon={Briefcase} spark="wave" accent />
        <KpiTile label="За подпис" value={signingCount} icon={PenSquare} spark="flat" />
        <KpiTile label="Документи" value={docsCount} icon={FileText} spark="rising" accent />
        <KpiTile label="Качени" value={uploadedCount} icon={FileUp} spark="bar" />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Бързи действия
        </h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSection("deals")}
            className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-r from-gold to-gold/80 px-5 py-4 text-sm font-bold text-navy shadow-[0_8px_20px_-6px_hsl(var(--gold)/0.4)] transition-all hover:shadow-[0_12px_28px_-6px_hsl(var(--gold)/0.55)] active:scale-[0.98]"
          >
            {/* shimmer sweep */}
            <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            <span className="relative">Нова сделка</span>
            <Plus className="relative h-5 w-5" strokeWidth={2.5} />
          </button>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href="/catalog"
              className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-card/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-gold transition-transform group-hover:scale-110">
                <Library className="h-4 w-4" />
              </span>
              <span className="flex-1">Изготви по шаблон</span>
              <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </a>
            <a
              href="/analyze"
              className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-card/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-gold transition-transform group-hover:scale-110">
                <Upload className="h-4 w-4" />
              </span>
              <span className="flex-1">Качи и анализирай</span>
              <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </a>
          </div>
        </div>
      </div>

      {/* Recent Deals */}
      <div className="rounded-3xl border border-border/60 bg-card/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Последни сделки</h2>
          <button
            type="button"
            onClick={() => setSection("deals")}
            className="text-[10px] font-bold uppercase tracking-wider text-gold transition-colors hover:text-gold/80"
          >
            Виж всички →
          </button>
        </div>
        {deals.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Все още няма сделки.</p>
        ) : (
          <ul className="space-y-2">
            {deals.slice(0, 5).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openTab({ kind: "deal", entityId: d.id, title: d.title })}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/40 transition-colors group-hover:border-gold/30">
                      <Briefcase className="h-4 w-4 text-muted-foreground group-hover:text-gold" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground">{d.counterparty ?? "—"}</p>
                    </div>
                  </div>
                  <StatusDot status={d.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
