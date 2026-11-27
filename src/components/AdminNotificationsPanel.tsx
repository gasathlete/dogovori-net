import { useEffect, useState } from "react";
import { Bell, Loader2, Send, Trash2 } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type BroadcastRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  kind: string;
};

export function AdminNotificationsPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,link,created_at,kind")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data as BroadcastRow[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Въведете заглавие");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("notifications").insert({
      user_id: null,
      kind: "broadcast",
      title: title.trim(),
      body: body.trim() || null,
      link: link.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error("Грешка при изпращане", { description: error.message });
      return;
    }
    toast.success("Известието е изпратено до всички потребители");
    setTitle("");
    setBody("");
    setLink("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване на това известие?")) return;
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Изтрито");
    load();
  };

  return (
    <section className="mt-8 rounded-lg border border-border/60 bg-card/40 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Bell className="h-5 w-5 text-gold" />
        Известия (broadcast)
      </h2>

      <form onSubmit={send} className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="n-title">Заглавие *</Label>
          <Input
            id="n-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Честит празник!"
            maxLength={200}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="n-body">Текст</Label>
          <Textarea
            id="n-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Кратко съобщение към всички потребители..."
            rows={3}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="n-link">Линк (по избор)</Label>
          <Input
            id="n-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/blog/post-slug или /catalog"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Само относителни пътища (започващи с /).
          </p>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={busy} className="bg-gradient-gold text-navy">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Изпрати до всички
          </Button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">Последно изпратени</h3>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gold" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Все още няма изпратени общи известия.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 rounded-md border border-border/40 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{n.title}</div>
                  {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("bg-BG")}
                    {n.link && <> · <span className="text-gold">{n.link}</span></>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(n.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
