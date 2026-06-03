// Owner-side dialog to create a multi-party signing envelope.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface SignerDraft { name: string; email: string; role: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  /** Snapshot stored in the envelope; can be the rendered contract object. */
  documentSnapshot: unknown;
  savedDocumentId?: string | null;
  uploadedContractId?: string | null;
}

export function MultiPartySigningDialog(p: Props) {
  const [signers, setSigners] = useState<SignerDraft[]>([
    { name: "", email: "", role: "" },
    { name: "", email: "", role: "" },
  ]);
  const [orderMode, setOrderMode] = useState<"parallel" | "sequential">("parallel");
  const [expiresIn, setExpiresIn] = useState(14);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function update(i: number, patch: Partial<SignerDraft>) {
    setSigners((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function add() { if (signers.length < 12) setSigners((a) => [...a, { name: "", email: "", role: "" }]); }
  function remove(i: number) { if (signers.length > 1) setSigners((a) => a.filter((_, idx) => idx !== i)); }

  async function submit() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-signing-request", {
      body: {
        title: p.title,
        document_snapshot: p.documentSnapshot,
        saved_document_id: p.savedDocumentId ?? null,
        uploaded_contract_id: p.uploadedContractId ?? null,
        signers,
        order_mode: orderMode,
        expires_in_days: expiresIn,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      const code = data?.error ?? error?.message;
      toast.error(code === "pro_required" ? "Изисква се Pro план" : (code ?? "Грешка"));
      return;
    }
    setCreatedId(data.request.id);
    toast.success("Заявката е създадена. Изпратете линковете на подписващите.");
  }

  return (
    <Dialog open={p.open} onOpenChange={(v) => { if (!v) { setCreatedId(null); } p.onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Изпрати за подпис — няколко страни</DialogTitle></DialogHeader>

        {createdId ? (
          <div className="space-y-4">
            <p className="text-sm">Заявката е създадена. Можете да следите статуса и да копирате линковете към всеки подписващ:</p>
            <Button asChild>
              <Link to={`/signing/${createdId}`}><ExternalLink className="h-4 w-4 mr-2" /> Отвори статус</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Подписващи</Label>
              {signers.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <Input placeholder="Име" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                  <Input placeholder="Имейл" value={s.email} onChange={(e) => update(i, { email: e.target.value })} />
                  <Input placeholder="Роля (по избор)" value={s.role} onChange={(e) => update(i, { role: e.target.value })} />
                  <Button variant="ghost" size="icon" onClick={() => remove(i)} disabled={signers.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={add} disabled={signers.length >= 12}>
                <Plus className="h-4 w-4 mr-1" /> Добави подписващ
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ред на подписване</Label>
                <RadioGroup value={orderMode} onValueChange={(v) => setOrderMode(v as any)}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="parallel" id="m-par" /><Label htmlFor="m-par" className="font-normal">Успоредно (всеки кога може)</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="sequential" id="m-seq" /><Label htmlFor="m-seq" className="font-normal">Последователно (по ред)</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Валидност (дни)</Label>
                <Input type="number" min={1} max={60} value={expiresIn} onChange={(e) => setExpiresIn(Number(e.target.value) || 14)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)}>Затвори</Button>
          {!createdId && (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Създай заявка за подпис
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
