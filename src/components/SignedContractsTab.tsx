import { useEffect, useState } from "react";
import { Loader2, PenTool, Download, CheckCircle2, Clock, ShieldCheck } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";

type SignedRow = {
  id: string;
  document_id: string;
  signed_at: string | null;
  signer_name: string | null;
  signed_signature: string | null;
  owner_signed_at: string | null;
  owner_signature: string | null;
  owner_signer_name: string | null;
  expires_at: string;
  doc?: { id: string; title: string; payload: any; kind: string } | null;
};

export function SignedContractsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<SignedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signOpen, setSignOpen] = useState<SignedRow | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerSig, setOwnerSig] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: links } = await supabase
      .from("shared_links")
      .select("id, document_id, signed_at, signer_name, signed_signature, owner_signed_at, owner_signature, owner_signer_name, expires_at")
      .eq("owner_id", userId)
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false });

    const ids = Array.from(new Set((links ?? []).map((l) => l.document_id)));
    let docMap: Record<string, any> = {};
    if (ids.length) {
      const { data: docs } = await supabase
        .from("saved_documents")
        .select("id, title, payload, kind")
        .in("id", ids);
      for (const d of docs ?? []) docMap[d.id] = d;
    }
    setRows(((links as any) ?? []).map((l: any) => ({ ...l, doc: docMap[l.document_id] ?? null })));
    setLoading(false);
  };

  useEffect(() => { if (userId) load(); /* eslint-disable-next-line */ }, [userId]);

  const submitOwnerSign = async () => {
    if (!signOpen) return;
    if (!ownerName.trim()) { toast.error("Въведете името си"); return; }
    if (!ownerSig) { toast.error("Подпишете в полето"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("shared_links")
      .update({
        owner_signed_at: new Date().toISOString(),
        owner_signature: ownerSig,
        owner_signer_name: ownerName.trim().slice(0, 120),
      })
      .eq("id", signOpen.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Договорът е подписан");
    setSignOpen(null); setOwnerName(""); setOwnerSig("");
    load();
  };

  const exportPdf = async (row: SignedRow) => {
    if (!row.doc?.payload) { toast.error("Документът не е намерен"); return; }
    if (!row.owner_signed_at) { toast.error("Първо подпишете договора"); return; }
    try {
      const { exportPDF } = await import("@/lib/exporters");
      const payload = row.doc.payload || {};
      const enriched = {
        ...payload,
        signature: {
          ...(payload.signature || {}),
          name_a: row.owner_signer_name || payload.signature?.name_a || "",
          name_b: row.signer_name || payload.signature?.name_b || "",
          city: payload.signature?.city || "",
          date: new Date().toLocaleDateString("bg-BG"),
          image_a: row.owner_signature || undefined,
          image_b: row.signed_signature || undefined,
        },
      };
      await exportPDF(enriched as any);
    } catch (e: any) {
      toast.error("Грешка при експорт: " + (e?.message ?? e));
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Все още няма подписани договори. Когато контрагент подпише чрез изпратен от вас линк, той ще се появи тук.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const both = !!r.owner_signed_at;
        return (
          <div key={r.id} className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif font-semibold truncate">{r.doc?.title ?? "(изтрит документ)"}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Подписан от <strong className="text-foreground">{r.signer_name}</strong></span>
                  <span>· {r.signed_at && new Date(r.signed_at).toLocaleString("bg-BG")}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {both ? (
                    <Badge variant="outline" className="border-green-600/40 text-green-500"><ShieldCheck className="mr-1 h-3 w-3" />Двустранно подписан</Badge>
                  ) : (
                    <Badge variant="outline" className="border-gold/40 text-gold"><Clock className="mr-1 h-3 w-3" />Чака вашия подпис</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!both && (
                  <Button size="sm" onClick={() => setSignOpen(r)} className="bg-gradient-gold text-navy">
                    <PenTool className="mr-1 h-4 w-4" /> Подпиши
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={!both || !r.doc?.payload} onClick={() => exportPdf(r)}>
                  <Download className="mr-1 h-4 w-4" /> Свали PDF
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <Dialog open={!!signOpen} onOpenChange={(o) => { if (!o) { setSignOpen(null); setOwnerName(""); setOwnerSig(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Вашият подпис</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Вашето име</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Име и фамилия" />
            </div>
            <div>
              <Label>Подпис</Label>
              <SignaturePad onCapture={setOwnerSig} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(null)}>Отказ</Button>
            <Button onClick={submitOwnerSign} disabled={busy} className="bg-gradient-gold text-navy">
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Запази подпис
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
