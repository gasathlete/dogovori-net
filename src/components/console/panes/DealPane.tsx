import { useEffect, useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useDeals, dealStatusLabel, type Deal, type DealStatus } from "@/hooks/useDeals";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FileText, FileUp, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STATUSES: DealStatus[] = ["draft", "negotiating", "signing", "active", "closed", "archived"];

export function DealPane({ dealId, tabId }: { dealId: string; tabId: string }) {
  const { deals, update, remove } = useDeals();
  const { setDirty, patchTab, close } = useConsoleStore();
  const deal = deals.find((d) => d.id === dealId);
  const [form, setForm] = useState<Deal | null>(deal ?? null);
  const [saving, setSaving] = useState(false);
  const [linked, setLinked] = useState<{ saved: any[]; uploaded: any[] }>({ saved: [], uploaded: [] });

  useEffect(() => {
    if (deal) setForm(deal);
  }, [deal]);

  useEffect(() => {
    (async () => {
      const [{ data: saved }, { data: uploaded }] = await Promise.all([
        supabase.from("saved_documents").select("id, title, kind").eq("deal_id" as any, dealId),
        supabase.from("uploaded_contracts").select("id, title, original_filename").eq("deal_id" as any, dealId),
      ]);
      setLinked({ saved: saved ?? [], uploaded: uploaded ?? [] });
    })();
  }, [dealId]);

  if (!form) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const patch = (p: Partial<Deal>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    setDirty(tabId, true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const updated = await update(form.id, {
      title: form.title,
      status: form.status,
      counterparty: form.counterparty,
      counterparty_email: form.counterparty_email,
      amount_eur: form.amount_eur,
      due_date: form.due_date,
      notes: form.notes,
    });
    setSaving(false);
    if (!updated) {
      toast.error("Грешка при запис");
      return;
    }
    setDirty(tabId, false);
    patchTab(tabId, { title: updated.title });
    toast.success("Запазено");
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={32} minSize={24} maxSize={50}>
          <div className="h-full overflow-y-auto border-r border-border/60 bg-card/20 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Метаданни
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Заглавие</label>
                <Input
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Статус</label>
                <Select value={form.status} onValueChange={(v) => patch({ status: v as DealStatus })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{dealStatusLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Контрагент</label>
                <Input
                  value={form.counterparty ?? ""}
                  onChange={(e) => patch({ counterparty: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Имейл за подпис</label>
                <Input
                  type="email"
                  value={form.counterparty_email ?? ""}
                  onChange={(e) => patch({ counterparty_email: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Сума (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount_eur ?? ""}
                    onChange={(e) => patch({ amount_eur: e.target.value ? parseFloat(e.target.value) : null })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Краен срок</label>
                  <Input
                    type="date"
                    value={form.due_date ?? ""}
                    onChange={(e) => patch({ due_date: e.target.value || null })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Бележки</label>
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => patch({ notes: e.target.value })}
                  className="mt-1 min-h-24"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={save} disabled={saving} className="flex-1 bg-gradient-gold text-navy">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Запази"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm("Изтриване на сделката?")) return;
                    await remove(form.id);
                    close(tabId);
                  }}
                  aria-label="Изтрий"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={68}>
          <div className="h-full overflow-y-auto p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Свързани документи
            </h2>

            {linked.saved.length === 0 && linked.uploaded.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                Все още няма свързани документи към тази сделка.
                <div className="mt-3 flex justify-center gap-2">
                  <a href="/catalog" className="rounded-md bg-gold/15 px-3 py-1.5 text-xs text-gold hover:bg-gold/25">
                    Изготви по шаблон
                  </a>
                  <a href="/build" className="rounded-md border border-border/60 px-3 py-1.5 text-xs hover:bg-muted/40">
                    Качи договор
                  </a>
                </div>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {linked.saved.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-gold" />
                      <span className="truncate text-sm">{d.title}</span>
                    </div>
                    <a
                      href={`/document/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-gold"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
                {linked.uploaded.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileUp className="h-4 w-4 text-gold" />
                      <span className="truncate text-sm">{d.title || d.original_filename}</span>
                    </div>
                    <a
                      href={`/uploaded/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-gold"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
