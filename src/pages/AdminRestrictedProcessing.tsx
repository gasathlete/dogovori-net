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
} from "@/icons";
import { toast } from "sonner";

interface EventRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  ip_hash: string | null;
  function_name: string;
  category: string;
  event_type: string;
  action: string;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  violence: "Насилие",
  sexual_minors: "Сексуална експлоатация / непълнолетни",
  human_trafficking: "Трафик на хора",
  drugs: "Наркотици",
  weapons: "Незаконни оръжия",
  fraud: "Измама / подкуп",
  terrorism: "Тероризъм",
  health_data: "Здравни данни",
  biometric: "Биометрични данни",
  criminal: "Наказателни производства",
  minors: "Данни за непълнолетни",
  political_religious: "Политически/религиозни убеждения",
  other: "Други ограничения",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  illegal_content_blocked: "Незаконно съдържание (блокирано)",
  special_category_detected: "Чувствителна категория (ограничено)",
};

function tone(c: string): "destructive" | "secondary" {
  if (["violence", "sexual_minors", "human_trafficking", "weapons", "terrorism", "drugs"].includes(c)) return "destructive";
  return "secondary";
}

export default function AdminRestrictedProcessing() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
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
        .from("restricted_processing_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (category !== "all") q = q.eq("category", category);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as EventRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Грешка при зареждане");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, category, eventType]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.user_email ?? "").toLowerCase().includes(s) ||
      r.function_name.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const dismiss = async (id: string) => {
    if (!confirm("Изтриване на записа от регистъра?")) return;
    const { error } = await supabase.from("restricted_processing_events" as any).delete().eq("id", id);
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
            <ShieldAlert className="h-7 w-7 text-amber-500" /> Регистър на ограничени обработки
          </h1>
          <Button variant="outline" size="sm" className="ml-auto" onClick={load} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} /> Опресни
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
          Неутрален регистър на събития, при които AI обработка е била блокирана —
          както при опит за незаконно съдържание, така и при засечена специална категория
          лични данни по чл. 9 GDPR. Записваме само минимални метаданни (хеширан IP, имейл,
          категория). Не съхраняваме откъси от съдържанието или открити термини.
        </p>

        <Card className="mb-4">
          <CardContent className="pt-4 flex flex-wrap gap-3 items-center">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Тип събитие" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всички типове</SelectItem>
                {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              placeholder="Търси по имейл или функция…"
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
                <TableHead>Тип</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Потребител</TableHead>
                <TableHead>Функция</TableHead>
                <TableHead>Действие</TableHead>
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
                  <TableCell className="text-xs">
                    {EVENT_TYPE_LABEL[r.event_type] ?? r.event_type}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tone(r.category)}>
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
                  <TableCell className="text-xs text-muted-foreground">{r.action}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => dismiss(r.id)} title="Изтрий">
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
          Не съхраняваме сурово съдържание или открити термини — само метаданни.
        </p>
      </div>
    </div>
  );
}
