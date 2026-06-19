import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package, Loader2, Plus, ExternalLink, Search, CheckCircle2, Archive, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { listMyKits, kitProgress, getKitWithItems, type UserKit } from "@/lib/kits";
import { cn } from "@/lib/utils";

interface KitRow extends UserKit {
  done?: number;
  total?: number;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return ""; }
}

const STATUS_META: Record<UserKit["status"], { label: string; icon: any; className: string }> = {
  in_progress: { label: "В процес", icon: Clock, className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  complete: { label: "Завършен", icon: CheckCircle2, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  archived: { label: "Архив", icon: Archive, className: "border-border/60 bg-muted/30 text-muted-foreground" },
};

export default function KitsTab() {
  const { user } = useAuth();
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const list = await listMyKits(user.id);
      // Fetch progress per kit in parallel (small N typically)
      const withProgress = await Promise.all(
        list.map(async (k) => {
          const detail = await getKitWithItems(k.id);
          const prog = detail ? kitProgress(detail.items) : { done: 0, total: 0 };
          return { ...k, done: prog.done, total: prog.total };
        }),
      );
      if (active) {
        setKits(withProgress);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const ordered = useMemo(() => {
    const list = [...kits].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter((k) => k.title.toLowerCase().includes(s));
  }, [kits, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">Комплекти</h2>
          <p className="text-xs text-muted-foreground">
            Синхронизирано с Workspace · {kits.length} {kits.length === 1 ? "комплект" : "комплекта"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Търси комплект…"
              className="h-9 w-full pl-8 text-xs sm:w-64"
            />
          </div>
          <Button asChild variant="outline" size="sm" className="border-gold/60 text-gold hover:bg-gold/10">
            <Link to="/console/kits">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Workspace
            </Link>
          </Button>
          <Button asChild size="sm" className="bg-gradient-gold text-navy hover:shadow-gold">
            <Link to="/komplekti">
              <Plus className="mr-1 h-3.5 w-3.5" /> Избери от каталога
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {q ? "Няма комплекти по това търсене." : "Все още няма комплекти."}
          </p>
          {!q && (
            <Button asChild size="sm" className="mt-4 bg-gradient-gold text-navy hover:shadow-gold">
              <Link to="/komplekti">
                <Plus className="mr-1 h-3.5 w-3.5" /> Разгледай каталога
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/30">
          {ordered.map((k) => {
            const meta = STATUS_META[k.status];
            const Icon = meta.icon;
            const total = k.total ?? 0;
            const done = k.done ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <li key={k.id}>
                <Link
                  to={`/komplekti/moi/${k.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-foreground">{k.title}</span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                          meta.className,
                        )}
                      >
                        <Icon className="h-2.5 w-2.5" /> {meta.label}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {done}/{total} готови · {pct}% · обновен {formatDate(k.updated_at)}
                    </div>
                    {total > 0 && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full bg-gold transition-all"
                          style={{ width: `${pct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
