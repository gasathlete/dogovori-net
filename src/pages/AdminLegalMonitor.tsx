/**
 * N1 — тесен административен статус екран за контролния слой на нормативните
 * източници. Показва САМО метаданни: източник, авторитет, последен успех,
 * свежест, последна промяна, чакащи прегледи и последния контролиран код за
 * грешка. Никакъв суров нормативен текст, никакви лични данни.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, RefreshCcw, ShieldCheck } from "@/icons";

interface SourceStatus {
  source_key: string;
  title: string;
  jurisdiction: string;
  authority_tier: string;
  enabled: boolean;
  watch_only: boolean;
  review_status: string;
  expected_cadence: string;
  freshness_state: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_change_at: string | null;
  parser_version: string;
}

interface RunSummary {
  source_key: string;
  outcome: string;
  error_code: string | null;
  started_at: string;
}

interface HealthPayload {
  ok?: boolean;
  code_allowlist?: number;
  enabled_in_code?: number;
  pending_review?: number;
  sources?: SourceStatus[];
  recent_runs?: RunSummary[];
  error?: string;
}

const AUTHORITY_LABEL: Record<string, string> = {
  official_promulgation: "Обнародване (авторитетно)",
  official_legislative_process: "Законодателен процес",
  official_consultation: "Обществена консултация",
  official_eu_publication: "Официален вестник на ЕС",
  official_eu_consolidated_helper: "Консолидация (неавтентична)",
};

const FRESHNESS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  fresh: "default",
  stale: "destructive",
  failing: "destructive",
  disabled: "outline",
  unknown: "secondary",
};

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("bg-BG");
}

export default function AdminLegalMonitor() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAllowed(false);
      return;
    }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data, error }) => {
      setAllowed(error ? false : Boolean(data));
    });
  }, [user, loading]);

  const call = useCallback(async (action: "health" | "sync_registry" | "poll", dryRun = false) => {
    setBusy(true);
    const { data, error } = await invokeEdgeFunction<HealthPayload>("legal-source-monitor", {
      body: { action, dry_run: dryRun },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(`Мониторът върна грешка: ${data?.error ?? error?.message ?? "неизвестна"}`);
      return null;
    }
    return data;
  }, []);

  const refresh = useCallback(async () => {
    const data = await call("health");
    if (data) setHealth(data);
  }, [call]);

  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed, refresh]);

  if (loading || allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto max-w-3xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Няма достъп</h1>
          <p className="mt-3 text-muted-foreground">Този екран е достъпен само за администратори.</p>
        </main>
      </div>
    );
  }

  const sources = health?.sources ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Монитор на нормативни източници | Админ</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/admin">
                <ArrowLeft className="mr-1 h-4 w-4" /> Админ
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Монитор на нормативни източници</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Само официални източници. Lex.bg остава легаси метаданни на корпуса и не се наблюдава.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
              <RefreshCcw className="mr-1 h-4 w-4" /> Обнови
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const r = await call("sync_registry");
                if (r) {
                  toast.success("Регистърът е синхронизиран от кода.");
                  void refresh();
                }
              }}
            >
              Синхронизирай регистъра
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const r = await call("poll", true);
                if (r) toast.success("Пробна проверка завърши. Нищо не е записано.");
              }}
            >
              Пробна проверка (dry run)
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Източници в кода</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{health?.code_allowlist ?? "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Активни за проверка</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{health?.enabled_in_code ?? "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Чакащи преглед</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{health?.pending_review ?? "—"}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Състояние по източник
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Източник</TableHead>
                  <TableHead>Авторитет</TableHead>
                  <TableHead>Свежест</TableHead>
                  <TableHead>Последен успех</TableHead>
                  <TableHead>Последна промяна</TableHead>
                  <TableHead>Последен код за грешка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Няма синхронизирани източници. Използвайте „Синхронизирай регистъра“.
                    </TableCell>
                  </TableRow>
                )}
                {sources.map((s) => {
                  const lastRun = (health?.recent_runs ?? []).find((r) => r.source_key === s.source_key);
                  return (
                    <TableRow key={s.source_key}>
                      <TableCell>
                        <div className="font-medium">{s.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.source_key} · {s.jurisdiction} · {s.expected_cadence} · парсер {s.parser_version}
                          {s.watch_only ? " · само наблюдение" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {AUTHORITY_LABEL[s.authority_tier] ?? s.authority_tier}
                      </TableCell>
                      <TableCell>
                        <Badge variant={FRESHNESS_TONE[s.freshness_state] ?? "secondary"}>
                          {s.freshness_state}
                        </Badge>
                        {!s.enabled && (
                          <div className="mt-1 text-xs text-muted-foreground">{s.review_status}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{fmt(s.last_success_at)}</TableCell>
                      <TableCell className="text-sm">{fmt(s.last_change_at)}</TableCell>
                      <TableCell className="text-sm">
                        {lastRun?.error_code ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{lastRun.error_code}</code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
