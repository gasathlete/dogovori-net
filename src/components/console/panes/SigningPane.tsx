import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PenSquare, Loader2, ExternalLink, CheckCircle2, Clock, XCircle } from "@/icons";
import { cn } from "@/lib/utils";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    completed: { label: "Подписан", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", Icon: CheckCircle2 },
    sent: { label: "Изпратен", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", Icon: Clock },
    pending: { label: "Чака подпис", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", Icon: Clock },
    declined: { label: "Отказан", cls: "border-red-500/40 bg-red-500/10 text-red-300", Icon: XCircle },
    expired: { label: "Изтекъл", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300", Icon: XCircle },
  };
  return map[status] ?? { label: status, cls: "border-border/60 bg-muted/20 text-muted-foreground", Icon: Clock };
}

export function SigningPane({ requestId }: { requestId: string }) {
  const [req, setReq] = useState<any | null>(null);
  const [signers, setSigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("signing_requests").select("*").eq("id", requestId).maybeSingle(),
        supabase
          .from("signing_request_signers")
          .select("*")
          .eq("request_id", requestId)
          .order("order_idx", { ascending: true }),
      ]);
      setReq(r);
      setSigners(s ?? []);
      setLoading(false);
    })();
  }, [requestId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!req) {
    return <div className="p-6 text-sm text-muted-foreground">Заявката не е намерена.</div>;
  }

  const b = statusBadge(req.status);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <PenSquare className="h-3.5 w-3.5 text-gold" /> Подпис
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold">{req.title || "Заявка за подпис"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Създадена на {new Date(req.created_at).toLocaleString("bg-BG")}
          </p>
        </div>
        <a
          href={`/signing/${req.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
        >
          <ExternalLink className="h-4 w-4" /> Отвори заявката
        </a>
      </div>

      <div className={cn("mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", b.cls)}>
        <b.Icon className="h-3.5 w-3.5" /> {b.label}
      </div>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Подписващи ({signers.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {signers.map((s) => {
          const sb = statusBadge(s.status);
          return (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.name || s.email}</div>
                <div className="truncate text-[11px] text-muted-foreground">{s.email}</div>
              </div>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", sb.cls)}>
                <sb.Icon className="h-3 w-3" /> {sb.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
