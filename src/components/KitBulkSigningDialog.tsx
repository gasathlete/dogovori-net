// Bulk signing dialog for kits — collects signers once and creates a
// separate signing envelope for every eligible item in the kit.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Plus, Trash2, AlertCircle } from "@/icons";
import type { UserKitItem } from "@/lib/kits";

interface SignerDraft { name: string; email: string; role: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kitTitle: string;
  items: UserKitItem[];
  isPro?: boolean;
  alreadySent?: boolean;
  onCreated?: () => void;
}

interface Prepared {
  item: UserKitItem;
  title: string;
  snapshot: unknown;
  savedId: string | null;
  uploadedId: string | null;
}

interface CreatedRow {
  itemId: string;
  title: string;
  requestId?: string;
  error?: string;
}

export function KitBulkSigningDialog(p: Props) {
  const [signers, setSigners] = useState<SignerDraft[]>([
    { name: "", email: "", role: "" },
    { name: "", email: "", role: "" },
  ]);
  const [orderMode, setOrderMode] = useState<"parallel" | "sequential">("parallel");
  const [expiresIn, setExpiresIn] = useState(14);
  const [loading, setLoading] = useState(false);
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CreatedRow[] | null>(null);

  // Only items that reference a real document can be signed.
  const eligible = useMemo(
    () => p.items.filter((i) => i.saved_id || i.uploaded_id),
    [p.items],
  );
  const skipped = p.items.length - eligible.length;

  const [alreadySignedCount, setAlreadySignedCount] = useState(0);

  useEffect(() => {
    if (!p.open) return;
    setResults(null);
    if (eligible.length === 0) { setPrepared([]); setAlreadySignedCount(0); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const savedIds = eligible.map((i) => i.saved_id).filter(Boolean) as string[];
      const uploadedIds = eligible.map((i) => i.uploaded_id).filter(Boolean) as string[];
      // Check which of these already have a signing_request — skip them to avoid duplicate envelopes.
      const [existingSavedRes, existingUpRes] = await Promise.all([
        savedIds.length
          ? supabase.from("signing_requests").select("saved_document_id").in("saved_document_id", savedIds)
          : Promise.resolve({ data: [] as any[] }),
        uploadedIds.length
          ? supabase.from("signing_requests").select("uploaded_contract_id").in("uploaded_contract_id", uploadedIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const sentSaved = new Set((existingSavedRes.data ?? []).map((r: any) => r.saved_document_id).filter(Boolean));
      const sentUp = new Set((existingUpRes.data ?? []).map((r: any) => r.uploaded_contract_id).filter(Boolean));
      const toProcess = eligible.filter((i) =>
        !(i.saved_id && sentSaved.has(i.saved_id)) && !(i.uploaded_id && sentUp.has(i.uploaded_id))
      );
      const alreadyCount = eligible.length - toProcess.length;

      const filteredSavedIds = toProcess.map((i) => i.saved_id).filter(Boolean) as string[];
      const filteredUpIds = toProcess.map((i) => i.uploaded_id).filter(Boolean) as string[];
      const [savedRes, uploadRes] = await Promise.all([
        filteredSavedIds.length
          ? supabase.from("saved_documents").select("id,title,payload").in("id", filteredSavedIds)
          : Promise.resolve({ data: [] as any[] }),
        filteredUpIds.length
          ? supabase.from("uploaded_contracts").select("id,title,original_filename,extracted_text").in("id", filteredUpIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (!alive) return;
      const savedMap = new Map((savedRes.data ?? []).map((r: any) => [r.id, r]));
      const upMap = new Map((uploadRes.data ?? []).map((r: any) => [r.id, r]));
      const rows: Prepared[] = toProcess.map((it) => {
        if (it.saved_id) {
          const r = savedMap.get(it.saved_id);
          return {
            item: it,
            title: r?.title || it.planned_doc_name || it.ref_label || "Документ",
            snapshot: r?.payload ?? null,
            savedId: it.saved_id,
            uploadedId: null,
          };
        }
        const r = upMap.get(it.uploaded_id!);
        return {
          item: it,
          title: r?.title || r?.original_filename || it.planned_doc_name || it.ref_label || "Документ",
          snapshot: { text: r?.extracted_text ?? "" },
          savedId: null,
          uploadedId: it.uploaded_id!,
        };
      });
      setPrepared(rows);
      setAlreadySignedCount(alreadyCount);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [p.open, eligible]);

  function update(i: number, patch: Partial<SignerDraft>) {
    setSigners((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function add() { if (signers.length < 12) setSigners((a) => [...a, { name: "", email: "", role: "" }]); }
  function remove(i: number) { if (signers.length > 1) setSigners((a) => a.filter((_, idx) => idx !== i)); }

  const canSubmit =
    prepared.length > 0 &&
    signers.every((s) => s.name.trim() && /.+@.+\..+/.test(s.email.trim()));

  async function submitAll() {
    setBusy(true);
    const out: CreatedRow[] = [];
    for (const row of prepared) {
      const { data, error } = await supabase.functions.invoke("create-signing-request", {
        body: {
          title: `${p.kitTitle} — ${row.title}`,
          document_snapshot: row.snapshot,
          saved_document_id: row.savedId,
          uploaded_contract_id: row.uploadedId,
          signers,
          order_mode: orderMode,
          expires_in_days: expiresIn,
        },
      });
      if (error || data?.error) {
        out.push({ itemId: row.item.id, title: row.title, error: data?.error ?? error?.message ?? "Грешка" });
      } else {
        out.push({ itemId: row.item.id, title: row.title, requestId: data.request.id });
      }
      setResults([...out]);
    }
    setBusy(false);
    const ok = out.filter((r) => r.requestId).length;
    if (ok > 0) toast.success(`Създадени ${ok} заявки за подпис`);
    if (ok < out.length) toast.error(`Неуспешни: ${out.length - ok}`);
    p.onCreated?.();
  }

  return (
    <Dialog open={p.open} onOpenChange={(v) => { if (!v) { setResults(null); } p.onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Изпрати комплекта за подпис</DialogTitle>
          <DialogDescription>
            За всеки документ ще бъде създадена отделна заявка със същите подписващи.
          </DialogDescription>
        </DialogHeader>

        {!p.isPro ? (
          <div className="space-y-4 rounded-lg border border-gold/40 bg-gold/5 p-6 text-center">
            <ExternalLink className="mx-auto h-5 w-5 text-gold" />
            <div>
              <h3 className="font-serif text-lg font-bold">e-Подпис — само за платени планове</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Комплектното подписване е налично в план Предприемач или Екип.
              </p>
            </div>
            <Button asChild className="w-full bg-gradient-gold text-navy hover:shadow-gold">
              <Link to="/plans">Виж плановете</Link>
            </Button>
          </div>
        ) : results ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Резултати за {results.length} документа:</p>
            <ul className="max-h-[360px] space-y-1.5 overflow-y-auto">
              {results.map((r) => (
                <li key={r.itemId} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {r.requestId ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <span className="line-clamp-1">{r.title}</span>
                  </div>
                  {r.requestId ? (
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-gold hover:text-gold">
                      <Link to={`/signing/${r.requestId}`}>Отвори</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-destructive">{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : prepared.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            {alreadySignedCount > 0
              ? "Всички готови документи вече са изпратени за подпис. За да изпратите отново, отворете съответната заявка."
              : "Няма документи, готови за подпис. Първо попълнете или качете документи в комплекта."}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs">
              <div className="font-medium text-foreground">Ще бъдат създадени {prepared.length} заявки:</div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {prepared.map((r) => <li key={r.item.id} className="line-clamp-1">{r.title}</li>)}
              </ul>
              {alreadySignedCount > 0 && (
                <p className="mt-2 text-[11px] text-amber-400">
                  {alreadySignedCount} документ(а) вече имат активна заявка и ще бъдат пропуснати.
                </p>
              )}
              {skipped > 0 && (
                <p className="mt-2 text-[11px] text-amber-400">
                  {skipped} елемент(а) без готов документ ще бъдат пропуснати.
                </p>
              )}
            </div>

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
                <Plus className="mr-1 h-4 w-4" /> Добави подписващ
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ред на подписване</Label>
                <RadioGroup value={orderMode} onValueChange={(v) => setOrderMode(v as any)}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="parallel" id="kb-par" />
                    <Label htmlFor="kb-par" className="font-normal">Успоредно</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="sequential" id="kb-seq" />
                    <Label htmlFor="kb-seq" className="font-normal">Последователно</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Валидност (дни)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value) || 14)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => p.onOpenChange(false)}>Затвори</Button>
          {p.isPro && !results && prepared.length > 0 && (
            <Button onClick={submitAll} disabled={busy || !canSubmit}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Създай {prepared.length} заявки
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
