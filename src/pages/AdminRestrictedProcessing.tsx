import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Loader2, ShieldAlert, Trash2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface IllegalRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  ip_hash: string | null;
  function_name: string;
  category: string;
  matched_term: string | null;
  payload_excerpt: string | null;
  user_agent: string | null;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  csam: "Детска експлоатация (CSAM)",
  terrorism: "Тероризъм",
  weapons: "Незаконно оръжие",
  drugs: "Незаконни наркотици",
  fraud: "Измама / документна",
  hate_speech: "Реч на омразата",
  malware: "Малуер / хакване",
};

function categoryTone(c: string): "destructive" | "default" | "secondary" {
  if (c === "csam" || c === "terrorism") return "destructive";
  if (c === "weapons" || c === "drugs" || c === "malware") return "destructive";
  return "secondary";
}

export default function AdminIllegalContent() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<IllegalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    try {
      let q = supabase
        .from("illegal_content_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (category !== "all") q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as IllegalRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Грешка при зареждане");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, category]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.user_email ?? "").toLowerCase().includes(s) ||
      (r.matched_term ?? "").toLowerCase().includes(s) ||
      (r.payload_excerpt ?? "").toLowerCase().includes(s) ||
      r.function_name.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const dismiss = async (id: string) => {
    if (!confirm("Изтриване на записа от регистъра?")) return;
    const { error } = await supabase.from("illegal_content_attempts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Изтрит");
  };

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh"><Header />
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Начало</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/privacy"><ArrowLeft className="h-4 w-4 mr-1" /> Privacy</Link>
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-amber-500" /> Опити за незаконно съдържание
          </h1>
          <Button variant="outline" size="sm" className="ml-auto" onClick={load} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} /> Опресни
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
          Регистър на блокирани заявки към edge функции, които съдържат термини от black-list.
          Показваме хеширан IP, имейл, кратък откъс (≤500 знака) и употребен термин — за оперативно проследяване.
        </p>

        <Card className="mb-4">
          <CardContent className="pt-4 flex flex-wrap gap-3 items-center">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Категория" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всички категории</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Търси по имейл, термин, функция…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="text-sm text-muted-foreground ml-auto">
              {filtered.length} от {rows.length}
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Потребител</TableHead>
                <TableHead>Функция</TableHead>
                <TableHead>Термин</TableHead>
                <TableHead>Откъс</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {busy && rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Няма записи.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className="text-sm">
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.created_at).toLocaleString("bg-BG")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={categoryTone(r.category)}>
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{r.user_email ?? <span className="text-muted-foreground">— анон —</span>}</div>
                    {r.ip_hash && (
                      <div className="text-muted-foreground">IP#{r.ip_hash.slice(0, 8)}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.function_name}</TableCell>
                  <TableCell className="text-xs">
                    {r.matched_term ? (
                      <code className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {r.matched_term}
                      </code>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="text-xs text-muted-foreground line-clamp-3">
                      {r.payload_excerpt ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => dismiss(r.id)}
                      title="Изтрий"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Записите се пазят до 12 месеца съгласно политиката за съхранение.
          Изтриването е окончателно — данните не подлежат на възстановяване.
        </p>
      </div>
    </div>
  );
}
