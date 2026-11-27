import { useEffect, useState } from "react";
import { Bell, Loader2, Send, Trash2, Plus, Search } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Topic = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_active: boolean;
  last_sent_at: string | null;
  last_sent_count: number;
  created_at: string;
};

type Recipient = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};

export function AdminEmailCampaignsPanel() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const loadTopics = async () => {
    setLoadingTopics(true);
    const { data, error } = await supabase
      .from("email_campaign_topics")
      .select("id,title,body,link,is_active,last_sent_at,last_sent_count,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoadingTopics(false);
    if (error) { toast.error(error.message); return; }
    setTopics((data as Topic[]) ?? []);
  };

  const loadRecipients = async (q?: string) => {
    setLoadingRecipients(true);
    const { data, error } = await supabase.rpc("admin_list_marketing_recipients", {
      _search: q || null,
      _limit: 200,
    });
    setLoadingRecipients(false);
    if (error) { toast.error(error.message); return; }
    setRecipients((data as Recipient[]) ?? []);
  };

  useEffect(() => { loadTopics(); loadRecipients(); }, []);

  const createTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Въведете заглавие на темата"); return; }
    setCreating(true);
    const { error } = await supabase.from("email_campaign_topics").insert({
      title: title.trim(),
      body: body.trim() || null,
      link: link.trim() || null,
    });
    setCreating(false);
    if (error) { toast.error("Темата не е записана", { description: error.message }); return; }
    toast.success("Темата е добавена");
    setTitle(""); setBody(""); setLink("");
    loadTopics();
  };

  const sendTopic = async (t: Topic) => {
    if (recipients.length === 0) {
      toast.error("Няма потребители с изрично съгласие — няма на кого да се изпрати.");
      return;
    }
    if (!confirm(
      `Изпращане на „${t.title}“ само до потребителите с изрично съгласие за имейл маркетинг?`,
    )) return;
    setBusyId(t.id);
    // Базата е окончателният филтър: дори този списък да е остарял, сървърът
    // изпраща само на изрично съгласилите се.
    const { data, error } = await supabase.rpc("admin_send_campaign_topic", { _topic_id: t.id });
    setBusyId(null);
    if (error) { toast.error("Изпращането не е извършено", { description: error.message }); return; }
    toast.success(`Изпратено до ${Number(data ?? 0)} потребители с изрично съгласие`);
    loadTopics();
    loadRecipients(search);
  };

  const removeTopic = async (id: string) => {
    if (!confirm("Изтриване на темата?")) return;
    const { error } = await supabase.from("email_campaign_topics").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Изтрито");
    loadTopics();
  };

  return (
    <section className="mt-8 rounded-lg border border-border/60 bg-card/40 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Bell className="h-5 w-5 text-gold" />
        Имейл кампании
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Изпраща се само до потребители с изрично съгласие за имейл маркетинг („+“). Липсата на избор („?“) и изричният отказ („−“) не са съгласие и се изключват.
      </p>

      <form onSubmit={createTopic} className="grid gap-3">
        <div>
          <Label htmlFor="c-title">Тема *</Label>
          <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Например: Нови шаблони за септември" />
        </div>
        <div>
          <Label htmlFor="c-body">Текст</Label>
          <Textarea id="c-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Кратко съобщение..." />
        </div>
        <div>
          <Label htmlFor="c-link">Линк (по избор)</Label>
          <Input id="c-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/catalog" />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={creating} variant="outline">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Добави тема
          </Button>
        </div>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Теми</h3>
          {loadingTopics ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gold" /></div>
          ) : topics.length === 0 ? (
            <p className="text-xs text-muted-foreground">Няма създадени теми.</p>
          ) : (
            <ul className="space-y-2">
              {topics.map((t) => (
                <li key={t.id} className="rounded-md border border-border/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{t.title}</div>
                      {t.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.body}</div>}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {t.last_sent_at
                          ? `Изпратена на ${new Date(t.last_sent_at).toLocaleString("bg-BG")} до ${t.last_sent_count} потребители`
                          : "Още не е изпращана"}
                        {t.link && <> · <span className="text-gold">{t.link}</span></>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" onClick={() => sendTopic(t)} disabled={busyId === t.id || recipients.length === 0} className="bg-gradient-gold text-navy">
                        {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeTopic(t.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Получатели</h3>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">+ {recipients.length}</Badge>
          </div>
          <div className="mb-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadRecipients(search)}
                placeholder="Търсене по имейл или име..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => loadRecipients(search)} disabled={loadingRecipients}>
              {loadingRecipients ? <Loader2 className="h-4 w-4 animate-spin" /> : "Търси"}
            </Button>
          </div>
          {loadingRecipients ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gold" /></div>
          ) : recipients.length === 0 ? (
            <p className="text-xs text-muted-foreground">Няма потребители с изрично съгласие за имейл маркетинг.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border/40 p-2">
              {recipients.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm">
                  <span className="min-w-0 truncate">
                    {r.email}
                    {r.display_name && <span className="ml-2 text-xs text-muted-foreground">{r.display_name}</span>}
                  </span>
                  <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-600">+</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
