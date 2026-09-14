import { useEffect, useState } from "react";
import { Bell, Loader2, Trash2, Check } from "@/icons";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DocumentReminder, REMINDER_KIND_LABEL, reminderStatus,
} from "@/hooks/useDocumentReminders";

type Target =
  | { savedDocumentId: string }
  | { uploadedContractId: string };

type Props = {
  target: Target;
  documentTitle: string;
  triggerClassName?: string;
  compact?: boolean;
  onChanged?: () => void;
};

export function DocumentReminderDialog({
  target, documentTitle, triggerClassName, compact, onChanged,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DocumentReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<DocumentReminder["kind"]>("expiration");
  const [note, setNote] = useState("");

  const savedId = "savedDocumentId" in target ? target.savedDocumentId : null;
  const uploadedId = "uploadedContractId" in target ? target.uploadedContractId : null;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("document_reminders")
      .select("*")
      .eq("user_id", user.id)
      .order("remind_at", { ascending: true });
    if (savedId) q = q.eq("saved_document_id", savedId);
    else if (uploadedId) q = q.eq("uploaded_contract_id", uploadedId);
    const { data, error } = await q;
    setLoading(false);
    if (!error) setList((data ?? []) as DocumentReminder[]);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!user) return toast.error("Влезте в профила си");
    if (!date) return toast.error("Изберете дата");
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      remind_at: new Date(date).toISOString(),
      kind,
      note: note.trim() || null,
    };
    if (savedId) payload.saved_document_id = savedId;
    if (uploadedId) payload.uploaded_contract_id = uploadedId;
    const { error } = await supabase.from("document_reminders").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Напомнянето е запазено");
    setDate("");
    setNote("");
    setKind("expiration");
    await load();
    onChanged?.();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("document_reminders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Изтрито");
    await load();
    onChanged?.();
  };

  const markDone = async (id: string) => {
    const { error } = await supabase
      .from("document_reminders")
      .update({ done_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Маркирано като изпълнено");
    await load();
    onChanged?.();
  };

  const activeCount = list.filter((r) => !r.done_at).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={triggerClassName ?? "h-10 w-full sm:h-9 sm:w-auto"}
          title="Напомняне"
          onClick={(e) => e.preventDefault()}
        >
          <Bell className="mr-1 h-3 w-3" />
          {compact ? "" : "Напомняне"}
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-gold/20 px-1.5 text-[10px] text-gold">
              {activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Напомняния</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">{documentTitle}</p>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-card/40 p-4 text-center text-xs text-muted-foreground">
              Все още няма напомняния за този документ.
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => {
                const s = reminderStatus(r);
                return (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-card/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${s.cls}`}>
                          {s.label}
                        </span>
                        <span className="text-xs font-medium">
                          {REMINDER_KIND_LABEL[r.kind]}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(r.remind_at).toLocaleDateString("bg-BG")}
                        </span>
                      </div>
                      {r.note && (
                        <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {!r.done_at && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markDone(r.id)} title="Изпълнено">
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)} title="Изтрий">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-gold/30 bg-gold/5 p-3">
          <div className="text-xs font-semibold text-gold">Ново напомняне</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="rem-date" className="text-xs">Дата</Label>
              <Input
                id="rem-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DocumentReminder["kind"])}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expiration">Изтичане на срока</SelectItem>
                  <SelectItem value="renewal">Подновяване</SelectItem>
                  <SelectItem value="custom">Друго</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="rem-note" className="text-xs">Бележка (по избор)</Label>
            <Textarea
              id="rem-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="напр. Уведоми контрагента 30 дни преди изтичането"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Затвори</Button>
          <Button onClick={submit} disabled={saving || !date}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Запази
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
