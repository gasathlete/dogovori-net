import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileSearch, Check, Trash2 } from "lucide-react";
import { anonymizePayload } from "@/lib/anonymize";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";

type Blank = {
  id: string;
  created_at: string;
  category: string;
  name: string;
  occurrences: number;
  status: "pending" | "published" | "rejected";
  blank_payload: { title: string; preamble: string; clauses: { number: string; title: string; body: string }[]; closing: string };
};

export function AdminBlanksPanel() {
  const [rows, setRows] = useState<Blank[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Blank | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("custom_contract_blanks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: "published" | "rejected") => {
    const { error } = await supabase
      .from("custom_contract_blanks")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "published" ? "Публикувана" : "Отхвърлена");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване на бланката?")) return;
    const { error } = await supabase.from("custom_contract_blanks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <FileSearch className="h-5 w-5 text-gold" />
        <h2 className="text-xl font-bold">Бланки от потребители</h2>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Автоматично извлечени бланки от „Изготви договор". Прегледайте и публикувайте подходящите.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Дата</th>
              <th className="p-3 text-left">Категория</th>
              <th className="p-3 text-left">Име</th>
              <th className="p-3 text-center">Поява</th>
              <th className="p-3 text-left">Статус</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("bg-BG")}</td>
                <td className="p-3">{r.category}</td>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-center">{r.occurrences}</td>
                <td className="p-3">
                  {r.status === "pending" && <Badge variant="outline">Чака</Badge>}
                  {r.status === "published" && <Badge className="bg-emerald-600">Публикувана</Badge>}
                  {r.status === "rejected" && <Badge variant="secondary">Отхвърлена</Badge>}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setPreview(r)}>Прегледай</Button>
                    {r.status !== "published" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "published")}>
                        <Check className="mr-1 h-3 w-3" /> Публикувай
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "rejected")}>Отхвърли</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !busy && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Няма бланки</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{preview?.blank_payload?.title}</DialogTitle></DialogHeader>
          {preview && (
            <article className="space-y-4 text-sm">
              <p className="whitespace-pre-line italic text-muted-foreground">{preview.blank_payload.preamble}</p>
              {preview.blank_payload.clauses?.map((c, i) => (
                <section key={i}>
                  <h3 className="font-bold uppercase">{c.number} {c.title}</h3>
                  <p className="mt-1 whitespace-pre-line">{c.body}</p>
                </section>
              ))}
              <p className="italic">{preview.blank_payload.closing}</p>
            </article>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
