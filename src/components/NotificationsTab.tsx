import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, ExternalLink, Loader2, Megaphone, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  user_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

type ReadRow = { notification_id: string };

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function iconFor(kind: string) {
  if (kind === "finish_doc") return FileText;
  if (kind === "broadcast") return Megaphone;
  return Bell;
}

export function NotificationsTab() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: notifs, error: nErr }, { data: rds, error: rErr }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,user_id,kind,title,body,link,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("notification_reads").select("notification_id"),
    ]);
    setLoading(false);
    if (nErr) {
      toast.error("Грешка при зареждане на известия", { description: nErr.message });
      return;
    }
    if (rErr) console.warn("reads load failed", rErr);
    setItems((notifs as Notification[]) ?? []);
    setReads(new Set(((rds as ReadRow[]) ?? []).map((r) => r.notification_id)));
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-tab")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markRead = async (id: string) => {
    if (reads.has(id)) return;
    setReads((prev) => new Set(prev).add(id));
    const { error } = await supabase.rpc("mark_notification_read", { _id: id });
    if (error) {
      toast.error("Грешка", { description: error.message });
      return;
    }
    window.dispatchEvent(new Event("notifications:refresh"));
  };

  const markAllRead = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("mark_all_notifications_read");
    setBusy(false);
    if (error) {
      toast.error("Грешка", { description: error.message });
      return;
    }
    setReads(new Set(items.map((i) => i.id)));
    window.dispatchEvent(new Event("notifications:refresh"));
    toast.success("Всички известия са маркирани като прочетени");
  };

  const unreadCount = items.filter((i) => !reads.has(i.id)).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-gold" />
            Известия
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Тук виждате персонални напомняния и съобщения от екипа на Dogovori.net.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
            Маркирай всички като прочетени
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Все още нямате известия.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = iconFor(n.kind);
            const isRead = reads.has(n.id);
            return (
              <li
                key={n.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  isRead
                    ? "border-border/40 bg-card/30"
                    : "border-gold/30 bg-gold/[0.04]",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isRead ? "bg-muted text-muted-foreground" : "bg-gold/15 text-gold",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={cn("text-sm font-semibold", !isRead && "text-foreground")}>
                        {n.title}
                      </h3>
                      {!isRead && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                    </div>
                    {n.body && (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatDate(n.created_at)}</span>
                      {n.user_id === null && <span className="rounded-full bg-muted px-2 py-0.5">Към всички</span>}
                      {n.kind === "finish_doc" && <span className="rounded-full bg-muted px-2 py-0.5">Напомняне</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {n.link && (
                      <Button asChild size="sm" variant="outline" className="border-gold/40 text-gold">
                        <Link to={n.link} onClick={() => markRead(n.id)}>
                          <ExternalLink className="mr-1 h-3 w-3" /> Отвори
                        </Link>
                      </Button>
                    )}
                    {!isRead && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                        <Check className="mr-1 h-3 w-3" /> Прочетено
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
