import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { FileText, FileUp, Plus, Loader2, Share2 } from "@/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type SavedDoc = { id: string; title: string; kind: string; created_at: string; user_id: string; route: "saved" };
type UploadedDoc = { id: string; title: string; created_at: string; user_id: string; original_filename: string | null; route: "uploaded" };
type TeamDoc = SavedDoc | UploadedDoc;

export function TeamDocuments({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<TeamDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [personal, setPersonal] = useState<TeamDoc[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: saved }, { data: uploaded }] = await Promise.all([
      supabase.from("saved_documents")
        .select("id, title, kind, created_at, user_id")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
      supabase.from("uploaded_contracts")
        .select("id, title, created_at, user_id, original_filename")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
    ]);
    const combined: TeamDoc[] = [
      ...(saved ?? []).map((d) => ({ ...d, route: "saved" as const })),
      ...(uploaded ?? []).map((d) => ({ ...d, route: "uploaded" as const })),
    ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setDocs(combined);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const openShareDialog = async () => {
    if (!user) return;
    const [{ data: saved }, { data: uploaded }] = await Promise.all([
      supabase.from("saved_documents")
        .select("id, title, kind, created_at, user_id")
        .eq("user_id", user.id)
        .is("team_id", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("uploaded_contracts")
        .select("id, title, created_at, user_id, original_filename")
        .eq("user_id", user.id)
        .is("team_id", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const combined: TeamDoc[] = [
      ...(saved ?? []).map((d) => ({ ...d, route: "saved" as const })),
      ...(uploaded ?? []).map((d) => ({ ...d, route: "uploaded" as const })),
    ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setPersonal(combined);
    setShareOpen(true);
  };

  const shareToTeam = async (doc: TeamDoc) => {
    setBusyId(doc.id);
    const table = doc.route === "saved" ? "saved_documents" : "uploaded_contracts";
    const { error } = await supabase.from(table).update({ team_id: teamId }).eq("id", doc.id);
    setBusyId(null);
    if (error) { toast.error("Грешка при споделяне"); return; }
    toast.success("Документът е споделен с екипа");
    setPersonal((p) => p.filter((d) => d.id !== doc.id));
    load();
  };

  const unshare = async (doc: TeamDoc) => {
    if (!confirm("Премахни от документите на фирмата? Документът ще остане в личния профил на собственика.")) return;
    const table = doc.route === "saved" ? "saved_documents" : "uploaded_contracts";
    const { error } = await supabase.from(table).update({ team_id: null }).eq("id", doc.id);
    if (error) { toast.error("Грешка"); return; }
    toast.success("Премахнат от фирмата");
    load();
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">Документи на фирмата</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Достъпни за всички членове на екипа.
          </p>
        </div>
        <Button onClick={openShareDialog} size="sm" className="bg-gradient-gold text-navy">
          <Plus className="mr-2 h-4 w-4" /> Сподели документ
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
          Все още няма споделени документи. Натиснете „Сподели документ", за да добавите от вашите лични документи.
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const Icon = d.route === "uploaded" ? FileUp : FileText;
            const href = d.route === "uploaded" ? `/uploaded/${d.id}` : `/document/${d.id}`;
            const subtitle = d.route === "uploaded"
              ? `Качен · ${new Date(d.created_at).toLocaleDateString("bg-BG")}`
              : `${(d as SavedDoc).kind} · ${new Date(d.created_at).toLocaleDateString("bg-BG")}`;
            const isOwner = d.user_id === user?.id;
            const canUnshare = isOwner || isAdmin;
            return (
              <li key={`${d.route}-${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-4 py-3 hover:border-gold/40">
                <Link to={href} className="flex flex-1 items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.title || (d as UploadedDoc).original_filename || "(без заглавие)"}</div>
                    <div className="text-xs text-muted-foreground">{subtitle}</div>
                  </div>
                </Link>
                {canUnshare && (
                  <Button variant="ghost" size="sm" onClick={() => unshare(d)} title="Премахни от фирмата">
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Сподели документ с фирмата</DialogTitle></DialogHeader>
          {personal.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Нямате лични документи за споделяне.</p>
          ) : (
            <ul className="space-y-2">
              {personal.map((d) => {
                const Icon = d.route === "uploaded" ? FileUp : FileText;
                return (
                  <li key={`${d.route}-${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 text-gold" />
                      <span className="truncate text-sm">{d.title || (d as UploadedDoc).original_filename || "(без заглавие)"}</span>
                    </div>
                    <Button size="sm" disabled={busyId === d.id} onClick={() => shareToTeam(d)} className="bg-gradient-gold text-navy">
                      {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сподели"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
