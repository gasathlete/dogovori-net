import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

interface SourceRow {
  id: string;
  short_code: string;
  title: string;
  jurisdiction: string;
  source_type: string;
  issuer: string | null;
  official_url: string | null;
  current_version: string | null;
  active: boolean;
  last_indexed_at: string | null;
}

const SOURCE_TYPES = [
  { value: "constitution", label: "Конституция" },
  { value: "code", label: "Кодекс" },
  { value: "law", label: "Закон" },
  { value: "regulation", label: "Наредба/Правилник" },
  { value: "eu_regulation", label: "Регламент ЕС" },
  { value: "eu_directive", label: "Директива ЕС" },
  { value: "case_law", label: "Съдебна практика" },
];

// Препоръчителен каталог — основни актове за договорно/трудово/потребителско/данни право.
// URL-ите сочат към публични версии в lex.bg / eur-lex.europa.eu.
const SEED_CATALOG: Array<{
  short_code: string;
  title: string;
  jurisdiction: "BG" | "EU";
  source_type: string;
  issuer: string;
  url: string;
}> = [
  { short_code: "ЗЗД", title: "Закон за задълженията и договорите", jurisdiction: "BG", source_type: "law", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/2121934337" },
  { short_code: "ТЗ", title: "Търговски закон", jurisdiction: "BG", source_type: "law", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/-14917630" },
  { short_code: "КТ", title: "Кодекс на труда", jurisdiction: "BG", source_type: "code", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/1594373121" },
  { short_code: "СК", title: "Семеен кодекс", jurisdiction: "BG", source_type: "code", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/2135637484" },
  { short_code: "ЗЗП", title: "Закон за защита на потребителите", jurisdiction: "BG", source_type: "law", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/2135513678" },
  { short_code: "ЗЗЛД", title: "Закон за защита на личните данни", jurisdiction: "BG", source_type: "law", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/-549710339" },
  { short_code: "ГПК", title: "Граждански процесуален кодекс", jurisdiction: "BG", source_type: "code", issuer: "Народно събрание", url: "https://lex.bg/laws/ldoc/2135558368" },
  { short_code: "GDPR", title: "Регламент (ЕС) 2016/679 — Общ регламент относно защитата на данните", jurisdiction: "EU", source_type: "eu_regulation", issuer: "ЕП и Съвет", url: "https://eur-lex.europa.eu/legal-content/BG/TXT/?uri=CELEX:32016R0679" },
];


export default function AdminLegalKB() {
  const { session } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fetchUrl, setFetchUrl] = useState("");
  const [form, setForm] = useState({
    short_code: "",
    title: "",
    jurisdiction: "BG",
    source_type: "law",
    issuer: "",
    official_url: "",
    raw_text: "",
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("legal_sources")
      .select("id,short_code,title,jurisdiction,source_type,issuer,official_url,current_version,active,last_indexed_at")
      .order("jurisdiction")
      .order("short_code");
    setSources(((data ?? []) as unknown) as SourceRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fetchFromUrl = async () => {
    if (!session?.access_token || !fetchUrl.trim()) return;
    setFetchingUrl(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-legal-source`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ url: fetchUrl.trim() }),
        },
      );
      const json = await resp.json();
      if (!resp.ok) {
        toast.error(json.error || "Грешка при извличане");
        return;
      }
      setForm((f) => ({
        ...f,
        raw_text: json.raw_text,
        official_url: json.url || f.official_url,
        jurisdiction: json.jurisdiction || f.jurisdiction,
        title: f.title || json.suggested_title || "",
      }));
      toast.success(`Извлечени ${Math.round((json.length || 0) / 1024)} KB текст. Прегледай и индексирай.`);
    } catch (e) {
      console.error(e);
      toast.error("Грешка при заявката");
    } finally {
      setFetchingUrl(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) return;
    if (!form.short_code.trim() || !form.title.trim() || !form.raw_text.trim()) {
      toast.error("Попълни код, заглавие и текст");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-legal-source`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            short_code: form.short_code.trim(),
            title: form.title.trim(),
            jurisdiction: form.jurisdiction,
            source_type: form.source_type,
            issuer: form.issuer.trim() || null,
            official_url: form.official_url.trim() || null,
            raw_text: form.raw_text,
          }),
        },
      );
      const json = await resp.json();
      if (!resp.ok) {
        toast.error(json.error || "Грешка при индексиране");
        return;
      }
      toast.success(`Индексирани ${json.chunks_inserted || 0} чънка от ${form.short_code}`);
      setForm({ ...form, raw_text: "", short_code: "", title: "" });
      load();
    } catch (e) {
      console.error(e);
      toast.error("Грешка при заявката");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("legal_sources").update({ active: !active }).eq("id", id);
    load();
  };

  const [seedProgress, setSeedProgress] = useState<string | null>(null);

  const seedOne = async (item: typeof SEED_CATALOG[number]) => {
    if (!session?.access_token) return { ok: false, reason: "no-session" };
    // 1) fetch text
    const fetchResp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-legal-source`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ url: item.url }),
      },
    );
    const fetchJson = await fetchResp.json();
    if (!fetchResp.ok) return { ok: false, reason: fetchJson.error || "fetch failed" };

    // 2) ingest
    const ingestResp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-legal-source`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          short_code: item.short_code,
          title: item.title,
          jurisdiction: item.jurisdiction,
          source_type: item.source_type,
          issuer: item.issuer,
          official_url: item.url,
          raw_text: fetchJson.raw_text,
        }),
      },
    );
    const ingestJson = await ingestResp.json();
    if (!ingestResp.ok) return { ok: false, reason: ingestJson.error || "ingest failed" };
    return { ok: true, chunks: ingestJson.chunks_inserted ?? 0, skipped: ingestJson.skipped };
  };

  const seedAll = async () => {
    const indexed = new Set(sources.map((s) => `${s.jurisdiction}:${s.short_code}`));
    const pending = SEED_CATALOG.filter((c) => !indexed.has(`${c.jurisdiction}:${c.short_code}`));
    if (pending.length === 0) {
      toast.info("Всички препоръчителни актове са вече индексирани.");
      return;
    }
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setSeedProgress(`${i + 1}/${pending.length} — ${item.short_code}…`);
      const res = await seedOne(item);
      if (res.ok) ok++; else { fail++; console.error("seed fail", item.short_code, res.reason); }
    }
    setSeedProgress(null);
    toast.success(`Готово: ${ok} успешни, ${fail} грешки.`);
    load();
  };


  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-8">
      <Helmet>
        <title>Нормативна база — Admin</title>
      </Helmet>
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-gold" />
        <h1 className="font-serif text-2xl font-bold">Нормативна база (RAG)</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Качи нормативни текстове (закон, кодекс, регламент). Системата ги разбива на статии,
        генерира embeddings и ги индексира за всички AI операции.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Препоръчителен каталог</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Един клик: системата сваля и индексира основните актове (ЗЗД, ТЗ, КТ, СК, ЗЗП, ЗЗЛД, ГПК, GDPR).
            Вече индексирани се прескачат автоматично.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SEED_CATALOG.map((c) => {
              const done = sources.some((s) => s.jurisdiction === c.jurisdiction && s.short_code === c.short_code);
              return (
                <Badge
                  key={`${c.jurisdiction}:${c.short_code}`}
                  variant={done ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {done ? "✓ " : ""}{c.short_code}
                </Badge>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={seedAll}
              disabled={seedProgress !== null}
              className="bg-gold text-navy hover:bg-gold/90"
            >
              {seedProgress !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Индексирай препоръчителните
            </Button>
            {seedProgress && (
              <span className="text-xs text-muted-foreground">{seedProgress}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Извличане от URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Разрешени домейни: lex.bg, eur-lex.europa.eu, dv.parliament.bg. Текстът се сваля,
            почиства от HTML и попълва формата отдолу за преглед преди индексиране.
          </p>
          <div className="flex gap-2">
            <Input
              type="url"
              value={fetchUrl}
              onChange={(e) => setFetchUrl(e.target.value)}
              placeholder="https://lex.bg/laws/ldoc/2121934337"
            />
            <Button
              type="button"
              variant="outline"
              onClick={fetchFromUrl}
              disabled={fetchingUrl || !fetchUrl.trim()}
            >
              {fetchingUrl && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Извлечи
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Добави / обнови източник</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Кратък код *</label>
              <Input
                value={form.short_code}
                onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                placeholder="ЗЗД, ТЗ, КТ, GDPR..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Заглавие *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Закон за задълженията и договорите"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Юрисдикция</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.jurisdiction}
                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
              >
                <option value="BG">България</option>
                <option value="EU">ЕС</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Тип</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value })}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Издател</label>
              <Input
                value={form.issuer}
                onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                placeholder="Народно събрание, ЕП и Съвет..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Официален URL</label>
              <Input
                type="url"
                value={form.official_url}
                onChange={(e) => setForm({ ...form, official_url: e.target.value })}
                placeholder="https://dv.parliament.bg/... или https://eur-lex.europa.eu/..."
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold">Пълен текст на акта *</label>
              <Textarea
                value={form.raw_text}
                onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
                rows={12}
                placeholder="Поставете пълния текст. Системата ще разпознае автоматично членове (Чл. N) и алинеи."
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Препоръчителен размер: 50-500 KB на акт. Идемпотентно: повторно качване с
                същия текст не дублира.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting} className="bg-gold text-navy hover:bg-gold/90">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Индексирай
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Индексирани източници ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Все още няма източници.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{s.short_code}</span>
                      <Badge variant="outline" className="text-[9px]">{s.jurisdiction}</Badge>
                      <Badge variant="outline" className="text-[9px]">{s.source_type}</Badge>
                      {!s.active && <Badge variant="destructive" className="text-[9px]">Изключен</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-muted-foreground">{s.title}</div>
                    {s.last_indexed_at && (
                      <div className="text-[10px] text-muted-foreground">
                        Индексиран: {new Date(s.last_indexed_at).toLocaleString("bg-BG")}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(s.id, s.active)}
                  >
                    {s.active ? "Изключи" : "Активирай"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
