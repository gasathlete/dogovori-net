// Picker dialog: shows the user's saved documents and lets them pick one
// to send for signature. Once chosen, hands off to MultiPartySigningDialog.
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { MultiPartySigningDialog } from "@/components/MultiPartySigningDialog";
import { FileText, Loader2, Search, ChevronRight } from "@/icons";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

interface SavedDocRow {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
  payload: unknown;
}

export function SendForSignatureDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { isPro, freeQuota, refresh } = useIsPro();
  const [docs, setDocs] = useState<SavedDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<SavedDocRow | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("saved_documents")
        .select("id, title, kind, updated_at, payload")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (alive) {
        setDocs((data ?? []) as SavedDocRow[]);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, user]);

  const filtered = useMemo(() => {
    if (!q.trim()) return docs;
    const needle = q.toLowerCase();
    return docs.filter((d) => (d.title ?? "").toLowerCase().includes(needle));
  }, [docs, q]);

  const signingFreeAvailable = !freeQuota.signingFreeUsed;

  return (
    <>
      <Dialog
        open={open && !picked}
        onOpenChange={(v) => {
          if (!v) setQ("");
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Изпрати за подпис</DialogTitle>
            <DialogDescription>
              Изберете документ от профила си, който да изпратите за електронен подпис.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Търсене по заглавие…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8 text-sm"
              autoFocus
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/60">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {docs.length === 0
                    ? "Няма записани документи в профила ви."
                    : "Няма съвпадения за търсенето."}
                </p>
                {docs.length === 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/catalog" onClick={() => onOpenChange(false)}>
                      Създай нов документ
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {filtered.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(d)}
                      className={cn(
                        "group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-gold" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-foreground">
                          {d.title || "Без заглавие"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(d.updated_at).toLocaleDateString("bg-BG")} · {d.kind}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {picked && (
        <MultiPartySigningDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) {
              setPicked(null);
              onOpenChange(false);
            }
          }}
          title={picked.title || "Договор"}
          documentSnapshot={picked.payload}
          savedDocumentId={picked.id}
          isPro={isPro}
          freeAvailable={signingFreeAvailable}
          onCreated={() => {
            refresh();
            onCreated?.();
          }}
        />
      )}
    </>
  );
}
