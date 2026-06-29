import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Activity, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportAuditCsv, exportAuditPdf, type AuditExportRow } from "@/lib/auditExport";

type AuditUser = { email: string | null; display_name: string | null; avatar_url: string | null } | null;
type Entry = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: any;
  created_at: string;
  user_id: string | null;
  actor: AuditUser;
  target_user: AuditUser;
};

const ACTION_LABEL: Record<string, string> = {
  "team.created": "създаде екипа",
  "team.ownership_transferred": "прехвърли собствеността на",
  "invite_sent": "изпрати покана до",
  "invite.resent": "изпрати повторно покана до",
  "invite.cancelled": "отмени покана до",
  "member_joined": "се присъедини към екипа",
  "member.left": "напусна екипа",
  "member.removed": "премахна член",
  "member.role_changed": "промени ролята на",
  "seats_updated": "обнови броя места",
  "branding.updated": "обнови брандинга",
};

const FILTER_OPTIONS = [
  { value: "all", label: "Всички действия" },
  { value: "member.invited", label: "Покани" },
  { value: "invite_sent", label: "Изпратени покани" },
  { value: "invite.resent", label: "Повторни покани" },
  { value: "invite.cancelled", label: "Отменени покани" },
  { value: "member_joined", label: "Присъединявания" },
  { value: "member.removed", label: "Премахвания" },
  { value: "member.role_changed", label: "Промени на роли" },
  { value: "seats_updated", label: "Промени на места" },
  { value: "branding.updated", label: "Брандинг" },
];

function userLabel(u: AuditUser, fallback?: string | null) {
  if (!u) return fallback || "Неизвестен";
  return u.display_name || u.email || fallback || "Неизвестен";
}

function renderEntry(e: Entry) {
  const actor = userLabel(e.actor);
  const label = ACTION_LABEL[e.action] ?? e.action;
  let tail = "";
  if (e.target_type === "user") tail = userLabel(e.target_user, e.target_id);
  else if (e.target_type === "email") tail = e.target_id ?? "";
  if (e.action === "seats_updated" && e.metadata) {
    tail = `от ${e.metadata.from} на ${e.metadata.to}`;
  }
  if (e.action === "member.role_changed" && e.metadata) {
    tail = `${userLabel(e.target_user, e.target_id)} (${e.metadata.from} → ${e.metadata.to})`;
  }
  return { actor, label, tail };
}

export function TeamAuditLog({ teamId }: { teamId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");

  const PAGE = 20;

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true); else setMore(true);
    try {
      const newOffset = reset ? 0 : offset;
      const { data, error } = await supabase.functions.invoke("team-members", {
        body: {
          teamId, action: "audit-list",
          limit: PAGE, offset: newOffset,
          actionFilter: filter === "all" ? undefined : filter,
        },
      });
      if (error) throw new Error(error.message);
      const fetched = (data?.entries ?? []) as Entry[];
      setEntries((prev) => reset ? fetched : [...prev, ...fetched]);
      setTotal(data?.total ?? 0);
      setOffset(newOffset + fetched.length);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); setMore(false); }
  }, [teamId, filter, offset]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [teamId, filter]);

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold">Дневник на действията</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Няма записи</p>
        </div>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {entries.map((e) => {
              const { actor, label, tail } = renderEntry(e);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-2 text-muted-foreground hover:bg-muted/50">
                  <span><strong className="text-foreground">{actor}</strong> {label} {tail && <span className="text-foreground">{tail}</span>}</span>
                  <span className="text-xs">{new Date(e.created_at).toLocaleString("bg-BG")}</span>
                </li>
              );
            })}
          </ul>
          {entries.length < total && (
            <div className="mt-4 text-center">
              <Button variant="outline" size="sm" disabled={more} onClick={() => load(false)}>
                Покажи още ({total - entries.length})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
