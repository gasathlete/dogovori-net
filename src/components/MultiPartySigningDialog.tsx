// Owner-side dialog to create a multi-party signing envelope.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PRICING_PLANS, monthlyLabel } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { trackSign } from "@/lib/docFunnel";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink } from "@/icons";
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
  /** Whether the user still has their one-time free online-signing export. */
  freeAvailable?: boolean;
  /** Whether the user is on a Pro/Team plan. */
  isPro?: boolean;
  /** Called when the request was created successfully (e.g. to refresh quota). */
  onCreated?: () => void;
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
      trackSign("fail", { source: "multi_party", doc_key: p.title, reason: String(code ?? "unknown").slice(0, 120) });
      if (code === "pro_required") {
        toast.error("Безплатният онлайн подпис вече е използван", {
          description: "Активирайте Pro за неограничен брой заявки за подпис.",
        });
      } else {
        toast.error(code ?? "Грешка");
      }
      return;
    }
    setCreatedId(data.request.id);
    trackSign("requested", { source: "multi_party", doc_key: p.title, signers: signers.length, order_mode: orderMode });
    p.onCreated?.();
    toast.success(
      !p.isPro && p.freeAvailable
        ? "Безплатната заявка е създадена. Изпратете линковете на подписващите."
        : "Заявката е създадена. Изпратете линковете на подписващите.",
    );
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
        ) : !p.isPro ? (
          // Free users: e-Подпис е само за платени планове.
          <div className="space-y-4 rounded-lg border border-gold/40 bg-gold/5 p-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gold/15">
              <ExternalLink className="h-5 w-5 text-gold" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold">e-Подпис — само за платени планове</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Изпращай неограничени заявки за подпис до няколко страни едновременно с {PRICING_PLANS.entrepreneur.name} за {monthlyLabel("entrepreneur")}.
              </p>
            </div>
            <Button asChild className="w-full bg-gradient-gold text-navy hover:shadow-gold">
              <Link to="/plans">Виж Предприемач</Link>
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
          {!createdId && p.isPro && (
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
