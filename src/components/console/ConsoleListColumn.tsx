import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { useDeals, dealStatusLabel, dealStatusColor, type Deal } from "@/hooks/useDeals";
import { supabase } from "@/integrations/supabase/client";
import { analysisBadge } from "@/lib/analysisVerification";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Search, Plus, Loader2, FileText, FileUp, Briefcase, Library, Users, Package, PenSquare } from "@/icons";
import { listMyKits, type UserKit } from "@/lib/kits";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendForSignatureDialog } from "@/components/SendForSignatureDialog";
import { toast } from "sonner";

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  badge?: { text: string; className: string };
}

function ListShell({
  title,
  onCreate,
  createLabel,
  createIcon: CreateIcon = Plus,
  onSearch,
  loading,
  rows,
  activeId,
  onOpen,
  emptyHint,
}: {
  title: string;
  onCreate?: () => void;
  createLabel?: string;
  createIcon?: any;
  onSearch: (q: string) => void;
  loading: boolean;
  rows: Row[];
  activeId: string | null;
  onOpen: (row: Row) => void;
  emptyHint: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 p-3">
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {onCreate && (
          <Button
            size="sm"
            onClick={onCreate}
            className="h-7 bg-gold/15 px-2 text-gold hover:bg-gold/25"
            variant="ghost"
          >
            <CreateIcon className="mr-1 h-3.5 w-3.5" /> {createLabel ?? "Нов"}
          </Button>
        )}
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Търси…"
            onChange={(e) => onSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => {
              const active = activeId === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className={cn(
                      "group relative flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-gold/10"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-0 left-0 w-px bg-gold transition-opacity",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                    <div className="flex w-full items-start gap-2">
                      <span className="line-clamp-1 flex-1 text-[13px] font-medium text-foreground">
                        {r.title}
                      </span>
                      {r.badge && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            r.badge.className,
                          )}
                        >
                          {r.badge.text}
                        </span>
                      )}
                    </div>
                    {r.subtitle && (
                      <span className="line-clamp-1 text-[11px] text-muted-foreground">
                        {r.subtitle}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DealsListView() {
  const { deals, loading, create } = useDeals();
  const { openTab, state } = useConsoleStore();
  const [q, setQ] = useState("");

  const rows: Row[] = useMemo(() => {
    // Chronological order (newest first) — matches Профил → Сделки
    const sorted = [...deals].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const filtered = q
      ? sorted.filter(
          (d) =>
            d.title.toLowerCase().includes(q.toLowerCase()) ||
            (d.counterparty ?? "").toLowerCase().includes(q.toLowerCase()),
        )
      : sorted;
    return filtered.map((d) => ({
      id: d.id,
      title: d.title,
      subtitle: [d.counterparty, d.amount_eur ? `${d.amount_eur.toFixed(2)} €` : null]
        .filter(Boolean)
        .join(" · "),
      badge: { text: dealStatusLabel(d.status), className: dealStatusColor(d.status) },
    }));
  }, [deals, q]);


  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Сделки"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onCreate={async () => {
        const deal = await create({ title: "Нова сделка" });
        if (!deal) {
          toast.error("Грешка при създаване");
          return;
        }
        openTab({
          kind: "deal",
          entityId: deal.id,
          title: deal.title,
        });
      }}
      onOpen={(r) => {
        const d = deals.find((x) => x.id === r.id);
        if (!d) return;
        openTab({ kind: "deal", entityId: d.id, title: d.title });
      }}
      emptyHint='Все още няма сделки. Натиснете „Нов" за първа сделка.'
    />
  );
}

function DocsListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("saved_documents")
        .select("id, title, kind, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (active) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter((d) => (d.title ?? "").toLowerCase().includes(q.toLowerCase()))
      : items;
    return filtered.map((d) => ({
      id: d.id,
      title: d.title || "(без заглавие)",
      subtitle: `${d.kind} · ${new Date(d.created_at).toLocaleDateString("bg-BG")}`,
    }));
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Документи"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onOpen={(r) => openTab({ kind: "document", entityId: r.id, title: r.title })}
      emptyHint="Няма запазени документи."
    />
  );
}

function UploadedListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("uploaded_contracts")
        .select("id, title, original_filename, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (active) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter((d) => (d.title ?? d.original_filename ?? "").toLowerCase().includes(q.toLowerCase()))
      : items;
    return filtered.map((d) => ({
      id: d.id,
      title: d.title || d.original_filename || "(без заглавие)",
      subtitle: new Date(d.created_at).toLocaleDateString("bg-BG"),
    }));
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Качени"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onOpen={(r) => openTab({ kind: "uploaded", entityId: r.id, title: r.title })}
      emptyHint="Няма качени договори."
    />
  );
}

function ClientsListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<{ name: string; count: number; created_at: string; source: "contact" | "deal" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [contactsRes, dealsRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("name, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("deals" as any)
          .select("counterparty, created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      const map = new Map<string, { name: string; count: number; created_at: string; source: "contact" | "deal" }>();
      ((contactsRes.data as any[]) ?? []).forEach((c) => {
        const name = (c.name ?? "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        map.set(key, { name, count: 0, created_at: c.created_at, source: "contact" });
      });
      ((dealsRes.data as any[]) ?? []).forEach((d) => {
        const name = (d.counterparty ?? "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          // keep the older (contact) created_at if present; otherwise take deal date
        } else {
          map.set(key, { name, count: 1, created_at: d.created_at, source: "deal" });
        }
      });
      // Chronological order (newest first) — matches Профил → Контрагенти
      setItems(
        Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
      : items;
    return filtered.map((c) => ({
      id: c.name,
      title: c.name,
      subtitle:
        c.count > 0
          ? `${c.count} ${c.count === 1 ? "сделка" : "сделки"}`
          : "Контрагент · няма сделки",
    }));
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Клиенти"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onOpen={(r) => openTab({ kind: "client", entityId: r.id, title: r.title })}
      emptyHint="Добавете контрагент в Моят профил или създайте сделка."
    />
  );
}


function TemplatesListView() {
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("template_search_index")
        .select("slug, name, category_title, bilingual, has_dynamic_wizard, lawyer_reviewed")
        .eq("locale", "bg")
        .order("name", { ascending: true })
        .limit(300);
      if (active) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter(
          (t) =>
            t.name.toLowerCase().includes(q.toLowerCase()) ||
            (t.category_title ?? "").toLowerCase().includes(q.toLowerCase()),
        )
      : items;
    return filtered.map((t) => ({
      id: t.slug,
      title: t.name,
      subtitle: t.category_title,
      badge: t.lawyer_reviewed
        ? { text: "юрист", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
        : undefined,
    }));
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Шаблони"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onOpen={(r) => openTab({ kind: "template", entityId: r.id, title: r.title })}
      emptyHint="Няма намерени шаблони."
    />
  );
}

function AnalysesListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("risk_analyses")
        .select("id, contract_type, summary, score, created_at, verification")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (active) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter((d) =>
          (d.contract_type ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (d.summary ?? "").toLowerCase().includes(q.toLowerCase()),
        )
      : items;
    return filtered.map((d) => {
      const badge = analysisBadge({ score: d.score, verification: (d as any).verification });
      return {
        id: d.id,
        title: d.contract_type || "Анализ",
        subtitle: new Date(d.created_at).toLocaleDateString("bg-BG"),
        badge,
      };
    });
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Анализи"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onOpen={(r) => openTab({ kind: "analysis", entityId: r.id, title: r.title })}
      emptyHint="Анализите се появяват при качване на договор."
    />
  );
}

function SigningListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("signing_requests")
      .select("id, title, status, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Deep-link support: /console/signing?send=1 auto-opens the picker
  // (used by the Hero → "Подпиши" CTA).
  useEffect(() => {
    if (searchParams.get("send") === "1") {
      setSendOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("send");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const rows: Row[] = useMemo(() => {
    const filtered = q
      ? items.filter((d) => (d.title ?? "").toLowerCase().includes(q.toLowerCase()))
      : items;
    return filtered.map((d) => {
      const cls =
        d.status === "completed"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : d.status === "declined" || d.status === "expired"
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300";
      return {
        id: d.id,
        title: d.title || "Заявка за подпис",
        subtitle: new Date(d.created_at).toLocaleDateString("bg-BG"),
        badge: { text: d.status, className: cls },
      };
    });
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <>
      <ListShell
        title="Подписи"
        loading={loading}
        rows={rows}
        activeId={activeId}
        onSearch={setQ}
        onCreate={() => setSendOpen(true)}
        createLabel="Изпрати за подпис"
        createIcon={PenSquare}
        onOpen={(r) => openTab({ kind: "signing", entityId: r.id, title: r.title })}
        emptyHint="Няма изпратени заявки за подпис."
      />
      <SendForSignatureDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        onCreated={reload}
      />
    </>
  );
}

function KitsListView() {
  const { user } = useAuth();
  const { openTab, state } = useConsoleStore();
  const navigate = useNavigate();
  const [items, setItems] = useState<UserKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const all = await listMyKits(user.id);
    setItems(all);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    if (!user) return;
    (async () => {
      const all = await listMyKits(user.id);
      if (active) { setItems(all); setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Chronological (newest first) — synced with Профил → Комплекти
  const rows: Row[] = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    const filtered = q
      ? sorted.filter((k) => k.title.toLowerCase().includes(q.toLowerCase()))
      : sorted;
    return filtered.map((k) => ({
      id: k.id,
      title: k.title,
      subtitle: new Date(k.updated_at).toLocaleDateString("bg-BG"),
      badge: {
        text:
          k.status === "complete" ? "готов" :
          k.status === "archived" ? "архив" : "процес",
        className:
          k.status === "complete"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : k.status === "archived"
              ? "border-border/60 bg-muted/30 text-muted-foreground"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300",
      },
    }));
  }, [items, q]);

  const activeId = state.tabs.find((t) => t.id === state.activeId)?.entityId ?? null;

  return (
    <ListShell
      title="Комплекти"
      loading={loading}
      rows={rows}
      activeId={activeId}
      onSearch={setQ}
      onCreate={() => navigate("/komplekti/nov")}
      onOpen={(r) => openTab({ kind: "kit", entityId: r.id, title: r.title })}
      emptyHint='Изберете готов комплект от каталога или натиснете „Нов".'
    />
  );
}

export function ConsoleListColumn() {
  const { state } = useConsoleStore();

  const view = useMemo(() => {
    switch (state.section) {
      case "deals":
        return <DealsListView />;
      case "documents":
        return <DocsListView />;
      case "uploaded":
        return <UploadedListView />;
      case "clients":
        return <ClientsListView />;
      case "templates":
        return <TemplatesListView />;
      case "analyses":
        return <AnalysesListView />;
      case "signing":
        return <SigningListView />;
      case "kits":
        return <KitsListView />;
      case "dashboard":
      default:
        return (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Briefcase className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Изберете секция отляво, за да видите списък.
            </p>
          </div>
        );
    }
  }, [state.section]);

  return <div className="h-full w-72 shrink-0 border-r border-border/60 bg-card/20">{view}</div>;
}
