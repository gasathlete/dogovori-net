// Admin tab: queries Google Search Console URL Inspection API to show which
// URLs are indexed vs not. Loads URLs from sitemap-templates.xml by default
// (the biggest pool of long-tail pages that tend to get stuck in
// "Discovered – currently not indexed").

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, ExternalLink, Filter, TrendingDown, TrendingUp, AlertTriangle } from "@/icons";

type ImpressionsTrend = {
  alert: boolean;
  alertThreshold: number;
  deltaPct: number;
  current: { impressions: number; clicks: number; ctr: number; position: number };
  previous: { impressions: number; clicks: number; ctr: number; position: number };
  range: { current: { start: string; end: string }; previous: { start: string; end: string } };
};

function ImpressionsTrendCard() {
  const [data, setData] = useState<ImpressionsTrend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("gsc-impressions-trend", {
        body: { alertThreshold: 10 },
      });
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res as ImpressionsTrend);
    } catch (e: any) {
      setError(e?.message ?? "Грешка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const delta = data?.deltaPct ?? 0;
  const dropping = delta < 0;
  const alert = data?.alert ?? false;

  return (
    <section
      className={
        "mt-10 rounded-lg border p-4 md:p-6 " +
        (alert ? "border-destructive/60 bg-destructive/5" : "border-border bg-card")
      }
    >
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          {alert ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : dropping ? (
            <TrendingDown className="h-5 w-5 text-gold" />
          ) : (
            <TrendingUp className="h-5 w-5 text-gold" />
          )}
          Impressions trend (7d vs предходни 7d)
        </h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">⚠ {error}</p>}

      {data && (
        <>
          {alert && (
            <p className="mt-3 text-sm font-medium text-destructive">
              🚨 Impressions паднаха с {Math.abs(delta).toFixed(1)}% спрямо предходните 7 дни (праг: {data.alertThreshold}%). Slack webhook е изпратен (ако е конфигуриран).
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Last 7d ({data.range.current.start} → {data.range.current.end})</div>
              <div className="mt-1 text-2xl font-bold">{data.current.impressions.toLocaleString("bg-BG")}</div>
              <div className="text-xs text-muted-foreground">{data.current.clicks.toLocaleString("bg-BG")} clicks · CTR {(data.current.ctr * 100).toFixed(2)}%</div>
            </div>
            <div className="rounded-md border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Prior 7d ({data.range.previous.start} → {data.range.previous.end})</div>
              <div className="mt-1 text-2xl font-bold">{data.previous.impressions.toLocaleString("bg-BG")}</div>
              <div className="text-xs text-muted-foreground">{data.previous.clicks.toLocaleString("bg-BG")} clicks · CTR {(data.previous.ctr * 100).toFixed(2)}%</div>
            </div>
            <div className="rounded-md border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Δ Impressions</div>
              <div className={"mt-1 text-2xl font-bold " + (alert ? "text-destructive" : dropping ? "text-gold" : "text-emerald-500")}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">avg pos {data.current.position.toFixed(1)} (от {data.previous.position.toFixed(1)})</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type Result = {
  url: string;
  verdict?: "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" | null;
  coverageState?: string | null;
  indexingState?: string | null;
  lastCrawlTime?: string | null;
  robotsTxtState?: string | null;
  pageFetchState?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  error?: string;
};

const SITEMAPS = [
  { label: "Шаблони (/shablon/*)", file: "sitemap-templates.xml" },
  { label: "Категории и сектори", file: "sitemap-categories.xml" },
  { label: "Блог", file: "sitemap-blog.xml" },
  { label: "Статични страници", file: "sitemap-static.xml" },
];

const BATCH = 25;

export function AdminGscPanel() {
  const [sitemap, setSitemap] = useState(SITEMAPS[0].file);
  const [urls, setUrls] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "not-indexed" | "indexed" | "error">("all");
  const [search, setSearch] = useState("");

  // Load URL list from selected sitemap
  useEffect(() => {
    setResults({});
    setUrls([]);
    fetch(`/${sitemap}`)
      .then((r) => r.text())
      .then((xml) => {
        const list = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
        setUrls(list);
      })
      .catch(() => toast.error(`Не успях да заредя /${sitemap}`));
  }, [sitemap]);

  async function check(urlsToCheck: string[]) {
    setLoading(true);
    setProgress({ done: 0, total: urlsToCheck.length });
    try {
      for (let i = 0; i < urlsToCheck.length; i += BATCH) {
        const slice = urlsToCheck.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("gsc-index-status", {
          body: { urls: slice },
        });
        if (error) throw error;
        const next: Record<string, Result> = { ...results };
        for (const r of (data?.results ?? []) as Result[]) next[r.url] = r;
        setResults(next);
        setProgress({ done: Math.min(i + BATCH, urlsToCheck.length), total: urlsToCheck.length });
      }
      toast.success("Проверката приключи");
    } catch (e: any) {
      toast.error(e?.message ?? "Грешка при проверка");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const checkAll = () => check(urls);
  const checkUnchecked = () => check(urls.filter((u) => !results[u]));

  const rows = useMemo(() => {
    return urls
      .filter((u) => !search || u.toLowerCase().includes(search.toLowerCase()))
      .map((u) => ({ url: u, r: results[u] }))
      .filter(({ r }) => {
        if (filter === "all") return true;
        if (!r) return filter === "not-indexed"; // unknown ≈ not-indexed
        if (filter === "error") return !!r.error;
        const indexed = r.verdict === "PASS" || /indexed/i.test(r.coverageState ?? "");
        return filter === "indexed" ? indexed : !indexed;
      });
  }, [urls, results, filter, search]);

  const stats = useMemo(() => {
    let indexed = 0, notIndexed = 0, errors = 0, unchecked = 0;
    for (const u of urls) {
      const r = results[u];
      if (!r) { unchecked++; continue; }
      if (r.error) { errors++; continue; }
      const isIndexed = r.verdict === "PASS" || /indexed/i.test(r.coverageState ?? "");
      if (isIndexed) indexed++; else notIndexed++;
    }
    return { indexed, notIndexed, errors, unchecked, total: urls.length };
  }, [urls, results]);

  return (
    <>
      <ImpressionsTrendCard />
      <section className="mt-10 border rounded-lg p-4 md:p-6 bg-card">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Search className="h-5 w-5 text-gold" /> Индексиране в Google
        </h2>
        <Badge variant="outline" className="ml-auto">
          {stats.indexed} индексирани · {stats.notIndexed} не · {stats.errors} грешки · {stats.unchecked} непроверени
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Реално състояние от Google Search Console (URL Inspection API). Daniel's GSC връзка.
      </p>

      <div className="flex items-end gap-2 mt-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Sitemap</label>
          <Select value={sitemap} onValueChange={setSitemap}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SITEMAPS.map((s) => (
                <SelectItem key={s.file} value={s.file}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Филтър</label>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всички ({urls.length})</SelectItem>
              <SelectItem value="not-indexed">Не са индексирани</SelectItem>
              <SelectItem value="indexed">Индексирани</SelectItem>
              <SelectItem value="error">Грешки</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Търсене</label>
          <Input placeholder="URL фрагмент..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={checkUnchecked} disabled={loading || urls.length === 0} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Провери непроверените
        </Button>
        <Button onClick={checkAll} disabled={loading || urls.length === 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Провери всички
        </Button>
      </div>

      {progress && (
        <p className="text-xs text-muted-foreground mt-2">
          Обработени {progress.done}/{progress.total} URL-а...
        </p>
      )}

      <div className="mt-4 border rounded-md overflow-x-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Покритие</TableHead>
              <TableHead>Последно обхождане</TableHead>
              <TableHead>Canonical (Google)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ url, r }) => {
              const indexed = r?.verdict === "PASS" || /indexed/i.test(r?.coverageState ?? "");
              const canonicalMismatch =
                r?.googleCanonical && r?.userCanonical && r.googleCanonical !== r.userCanonical;
              return (
                <TableRow key={url}>
                  <TableCell className="font-mono text-xs max-w-[300px] truncate" title={url}>
                    {url.replace("https://dogovori.net", "")}
                  </TableCell>
                  <TableCell>
                    {!r ? (
                      <Badge variant="outline">не е проверен</Badge>
                    ) : r.error ? (
                      <Badge variant="destructive" title={r.error}>грешка</Badge>
                    ) : indexed ? (
                      <Badge className="bg-emerald-600 text-white">индексиран</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        {r.verdict ?? "не е индексиран"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r?.coverageState ?? (r?.error ? "—" : "—")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r?.lastCrawlTime ? new Date(r.lastCrawlTime).toLocaleDateString("bg-BG") : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {canonicalMismatch ? (
                      <span className="text-amber-600" title={`User: ${r?.userCanonical}\nGoogle: ${r?.googleCanonical}`}>
                        ≠ различен
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{r?.googleCanonical ? "✓" : "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-gold">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Няма резултати
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </section>
    </>
  );
}
