/**
 * /admin/ai-json — „Неуспешни AI отговори".
 *
 * Показва последните провали при парсване на AI JSON: коя функция, кой етап,
 * точката на прекъсване (offset + контекст), класификация на причината и
 * предложената корекция. Копира готов блок за промпта за подобряване.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle, Copy, RefreshCcw, Trash } from "@/icons";
import { cn } from "@/lib/utils";

interface Failure {
  id: string;
  created_at: string;
  fn: string;
  model: string | null;
  stage: string;
  error_message: string | null;
  raw_length: number | null;
  break_offset: number | null;
  break_kind: string | null;
  break_context: string | null;
  suggestion: string | null;
  missing_closers: string | null;
  repair_attempted: boolean;
  raw_tail: string | null;
}

const KIND_LABEL: Record<string, string> = {
  truncated_string: "Отрязан стринг (лимит токени)",
  unclosed_container: "Незатворени скоби",
  trailing_comma: "Излишна запетая",
  dangling_key: "Ключ без стойност",
  control_char: "Неескейпнати контролни символи",
  no_json_found: "Липсва JSON в отговора",
  unknown: "Неясна причина",
};

export default function AdminAiJson() {
  const [rows, setRows] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("ai_parse_failures")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    setRows((data ?? []) as Failure[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byFn = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.fn, (m.get(r.fn) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.break_kind ?? "unknown", (m.get(r.break_kind ?? "unknown") ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const improvementPrompt = useMemo(() => {
    if (!rows.length) return "";
    const lines = [
      "## Задача: отстрани причините за неуспешни AI JSON отговори",
      "",
      `Последни ${rows.length} провала (най-нов пръв). Целта е нула 500 грешки от парсване.`,
      "",
      "### Разпределение по функция",
      ...byFn.map(([fn, n]) => `- ${fn}: ${n}`),
      "",
      "### Разпределение по причина",
      ...byKind.map(([k, n]) => `- ${KIND_LABEL[k] ?? k}: ${n}`),
      "",
      "### Конкретни случаи",
      ...rows.slice(0, 12).map(
        (r) =>
          `- [${new Date(r.created_at).toLocaleString("bg-BG")}] ${r.fn} / ${r.stage}` +
          ` · модел: ${r.model ?? "n/a"} · дължина: ${r.raw_length ?? "?"}` +
          ` · offset: ${r.break_offset ?? "?"} · причина: ${KIND_LABEL[r.break_kind ?? "unknown"] ?? r.break_kind}` +
          `\n  Корекция: ${r.suggestion ?? "—"}` +
          `\n  Контекст: \`${(r.break_context ?? "").slice(0, 200).replace(/`/g, "'")}\``,
      ),
      "",
      "### Очаквани действия",
      "1. Увеличи max_tokens / раздели генерацията там, където отговорите се отрязват.",
      "2. Наложи structured output схема за функциите с най-много провали.",
      "3. Добави regression тест в src/test/aiJsonParsers.test.ts за всеки нов граничен случай.",
    ];
    return lines.join("\n");
  }, [rows, byFn, byKind]);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(improvementPrompt);
    toast.success("Промптът е копиран — постави го в чата за подобряване.");
  };

  const clearOld = async () => {
    const { error } = await supabase
      .from("ai_parse_failures")
      .delete()
      .lt("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
    if (error) toast.error(error.message);
    else {
      toast.success("Записите по-стари от 30 дни са изчистени.");
      void load();
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <Seo title="Неуспешни AI отговори · Админ" description="Диагностика на AI JSON провали." noindex />
      <Header />
      <main className="container py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Неуспешни AI отговори</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Точка на прекъсване и предложена корекция за всеки провал при парсване на JSON.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCcw className="mr-1.5 h-4 w-4" /> Обнови
            </Button>
            <Button size="sm" onClick={copyPrompt} disabled={!rows.length}>
              <Copy className="mr-1.5 h-4 w-4" /> Към промпта за подобряване
            </Button>
            <Button variant="outline" size="sm" onClick={clearOld} disabled={!rows.length}>
              <Trash className="mr-1.5 h-4 w-4" /> Изчисти &gt;30 дни
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Зареждане…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-danger" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !rows.length && (
          <div className="rounded-lg border border-hairline bg-card p-8 text-center text-sm text-muted-foreground">
            Няма регистрирани провали. Всички AI отговори се парсват успешно.
          </div>
        )}

        {!!rows.length && (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-hairline bg-card p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  По функция
                </p>
                {byFn.map(([fn, n]) => (
                  <div key={fn} className="flex justify-between border-b border-hairline/60 py-1 text-sm last:border-0">
                    <span className="font-mono text-xs">{fn}</span>
                    <span className="font-semibold">{n}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-hairline bg-card p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  По причина
                </p>
                {byKind.map(([k, n]) => (
                  <div key={k} className="flex justify-between border-b border-hairline/60 py-1 text-sm last:border-0">
                    <span>{KIND_LABEL[k] ?? k}</span>
                    <span className="font-semibold">{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <ul className="space-y-2">
              {rows.map((r) => {
                const open = openId === r.id;
                return (
                  <li key={r.id} className="rounded-lg border border-hairline bg-card">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left"
                    >
                      <span className="font-mono text-xs font-semibold">{r.fn}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {r.stage}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          r.break_kind === "truncated_string" ? "text-danger" : "text-muted-foreground",
                        )}
                      >
                        {KIND_LABEL[r.break_kind ?? "unknown"] ?? r.break_kind}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        offset {r.break_offset ?? "?"} / {r.raw_length ?? "?"}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("bg-BG")}
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-3 border-t border-hairline p-3 text-sm">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Предложена корекция
                          </p>
                          <p>{r.suggestion ?? "—"}</p>
                          {r.missing_closers && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Липсващи затварящи символи: <code>{r.missing_closers}</code>
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Контекст на прекъсването
                          </p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
                            {r.break_context ?? "—"}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Край на отговора (raw)
                          </p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
                            {r.raw_tail ?? "—"}
                          </pre>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Грешка: {r.error_message ?? "—"} · Модел: {r.model ?? "n/a"} ·
                          {r.repair_attempted ? " направен е repair опит" : " без repair опит"}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
