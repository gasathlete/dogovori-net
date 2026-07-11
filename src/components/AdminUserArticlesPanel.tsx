import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, Check, Trash2, Bird, X, ExternalLink } from "@/icons";
import { Link } from "react-router-dom";

const CATEGORIES = [
  "Договорно право", "Трудово право", "Търговско право", "Имоти",
  "Семейно право", "Данъци", "GDPR / Защита на данните", "Електронна търговия",
  "Защита на потребителите", "Финанси и заеми", "Интелектуална собственост", "Други",
];

interface Article {
  id: string;
  created_at: string;
  title: string;
  slug: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  source: "user" | "admin";
  word_count: number;
  image_url: string;
  summary: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

export function AdminUserArticlesPanel() {
  const [rows, setRows] = useState<Article[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Article | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  // Generate form
  const [genOpen, setGenOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [genCategory, setGenCategory] = useState(CATEGORIES[0]);
  const [sectorId, setSectorId] = useState("");
  const [mandatoryText, setMandatoryText] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setBusy(true);
    let q = supabase.from("user_articles").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as unknown as Article[]) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    const patch = status === "approved"
      ? { status, reviewed_at: new Date().toISOString(), published_at: new Date().toISOString() }
      : { status, reviewed_at: new Date().toISOString() };
    const { error } = await supabase.from("user_articles").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Публикувана" : "Отхвърлена");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване на статията?")) return;
    const { error } = await supabase.from("user_articles").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const generate = async () => {
    if (!topic || mandatoryText.trim().length < 30) {
      toast.error("Тема и задължителен текст (мин. 30 знака) са нужни.");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("admin-generate-article", {
      body: { topic, category: genCategory, sectorId: sectorId || undefined, mandatoryText },
    });
    setGenerating(false);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    toast.success("Статията е генерирана и публикувана.");
    setGenOpen(false);
    setTopic(""); setSectorId(""); setMandatoryText("");
    load();
  };

  return (
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gold" />
          <h2 className="text-xl font-bold">Блог статии</h2>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Чакащи одобрение</SelectItem>
              <SelectItem value="approved">Публикувани</SelectItem>
              <SelectItem value="rejected">Отхвърлени</SelectItem>
              <SelectItem value="all">Всички</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setGenOpen(true)}>
            <Bird className="mr-1 h-4 w-4" /> Генерирай статия
          </Button>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Потребителски статии за модерация и админ-генерация чрез AI (тема + сектор + задължителен текст).
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Дата</th>
              <th className="p-3 text-left">Заглавие</th>
              <th className="p-3 text-left">Категория</th>
              <th className="p-3 text-center">Думи</th>
              <th className="p-3 text-left">Източник</th>
              <th className="p-3 text-left">Статус</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("bg-BG")}</td>
                <td className="p-3 font-medium">{r.title}</td>
                <td className="p-3">{r.category}</td>
                <td className="p-3 text-center">{r.word_count}</td>
                <td className="p-3"><Badge variant="outline">{r.source === "admin" ? "Редакция" : "Потребител"}</Badge></td>
                <td className="p-3">
                  {r.status === "pending" && <Badge variant="outline">Чака</Badge>}
                  {r.status === "approved" && <Badge className="bg-emerald-600">Публикувана</Badge>}
                  {r.status === "rejected" && <Badge variant="secondary">Отхвърлена</Badge>}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setPreview(r)}>Прегледай</Button>
                    {r.status === "approved" && (
                      <Button asChild size="sm" variant="ghost"><Link to={`/blog/u/${r.slug}`} target="_blank"><ExternalLink className="h-3 w-3" /></Link></Button>
                    )}
                    {r.status !== "approved" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "approved")}>
                        <Check className="mr-1 h-3 w-3" /> Одобри
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "rejected")}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !busy && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Няма статии</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>
          {preview && (
            <article className="space-y-4 text-sm">
              <img src={preview.image_url} alt="" className="aspect-[16/9] w-full rounded-lg object-cover" />
              <p className="italic text-muted-foreground">{preview.summary}</p>
              <p className="whitespace-pre-line">{preview.intro}</p>
              {(preview.sections ?? []).map((s, i) => (
                <section key={i}>
                  <h3 className="font-bold">{s.heading}</h3>
                  <p className="mt-1 whitespace-pre-line">{s.body}</p>
                </section>
              ))}
            </article>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Генерирай статия (AI)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="topic">Тема / Заглавие</Label>
              <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Напр. Какво трябва да знаем за неустойките в договорите" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Категория</Label>
                <Select value={genCategory} onValueChange={setGenCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sector">Сектор (опционално)</Label>
                <Input id="sector" value={sectorId} onChange={(e) => setSectorId(e.target.value)} placeholder="напр. it, tax, real-estate" />
              </div>
            </div>
            <div>
              <Label htmlFor="mand">Задължителен текст (ще бъде интегриран дословно)</Label>
              <Textarea id="mand" value={mandatoryText} onChange={(e) => setMandatoryText(e.target.value)} rows={6}
                placeholder="Текст, цитат от закон, конкретно правило, спонсорирано съобщение и т.н." />
              <p className="mt-1 text-xs text-muted-foreground">Минимум 30 знака. Ще бъде вмъкнат в статията.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setGenOpen(false)}>Отказ</Button>
              <Button onClick={generate} disabled={generating}>
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Генерирай и публикувай
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
