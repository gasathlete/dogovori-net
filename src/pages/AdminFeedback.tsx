import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Star, MessageSquare } from "@/icons";

type Row = {
  id: string;
  user_id: string | null;
  email: string | null;
  category: "bug" | "idea" | "template_request" | "ui" | "other";
  source_page: string | null;
  source_context: any;
  subject: string;
  body: string;
  rating: number | null;
  status: "new" | "triaged" | "done" | "wontfix";
  admin_notes: string | null;
  created_at: string;
};

const CAT_LABELS: Record<Row["category"], string> = {
  bug: "🐞 Бъг",
  idea: "💡 Идея",
  template_request: "📄 Шаблон",
  ui: "🎨 UI/UX",
  other: "💬 Друго",
};

const STATUS_LABELS: Record<Row["status"], string> = {
  new: "Нов",
  triaged: "В работа",
  done: "Готово",
  wontfix: "Отказано",
};

export default function AdminFeedbackPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const [catFilter, setCatFilter] = useState<"all" | Row["category"]>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "wizard" | "other">("all");

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    let q = supabase.from("feedback_submissions").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    if (catFilter !== "all") q = q.eq("category", catFilter);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Row[]) ?? []);
  };

  useEffect(() => { if (allowed) load(); }, [allowed, filter, catFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id: string, status: Row["status"]) => {
    const { error } = await supabase.from("feedback_submissions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  const updateNotes = async (id: string, admin_notes: string) => {
    const { error } = await supabase.from("feedback_submissions").update({ admin_notes }).eq("id", id);
    if (error) toast.error(error.message);
  };

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold">Достъп отказан</h1>
          <Button asChild variant="outline" className="mt-4"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="container py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
            <MessageSquare className="h-5 w-5 text-gold" /> Обратна връзка
          </h1>
          <span className="ml-2 text-xs text-muted-foreground">({rows.length})</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всички статуси</SelectItem>
              <SelectItem value="new">Нови</SelectItem>
              <SelectItem value="triaged">В работа</SelectItem>
              <SelectItem value="done">Готово</SelectItem>
              <SelectItem value="wontfix">Отказани</SelectItem>
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={(v) => setCatFilter(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всички категории</SelectItem>
              <SelectItem value="bug">🐞 Бъг</SelectItem>
              <SelectItem value="idea">💡 Идея</SelectItem>
              <SelectItem value="template_request">📄 Шаблон</SelectItem>
              <SelectItem value="ui">🎨 UI/UX</SelectItem>
              <SelectItem value="other">💬 Друго</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={load} variant="outline" size="sm" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Опресни
          </Button>
        </div>

        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
              Няма записи за тези филтри.
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{CAT_LABELS[r.category]}</Badge>
                    {r.source_page && (
                      <Badge variant="outline" className="border-gold/30 text-gold">
                        От: {r.source_context?.source_label || r.source_page}
                      </Badge>
                    )}
                    {r.rating && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-gold">
                        <Star className="h-3 w-3" fill="currentColor" /> {r.rating}/5
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("bg-BG")}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold">{r.subject}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                  {r.email && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Контакт: <a href={`mailto:${r.email}`} className="text-gold hover:underline">{r.email}</a>
                    </p>
                  )}
                </div>
                <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Row["status"])}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as Row["status"][]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3">
                <Textarea
                  defaultValue={r.admin_notes ?? ""}
                  placeholder="Вътрешни бележки (видими само за admin)"
                  rows={2}
                  className="text-xs"
                  onBlur={(e) => {
                    if (e.target.value !== (r.admin_notes ?? "")) {
                      updateNotes(r.id, e.target.value);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
