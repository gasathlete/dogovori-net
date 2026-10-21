import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ScrollText, Download } from "@/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { escapeCell } from "@/lib/csv";

interface ConsentRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  granted_at: string;
  document_version: string | null;
  session_id: string | null;
  path: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Admin panel: latest AI-disclaimer acceptances per user with the date
 * and browser session ID in which each acceptance was recorded.
 *
 * Backed by the security-definer RPC `admin_list_ai_disclaimer_consents`
 * that enforces `is_staff(auth.uid())`.
 */
export function AiDisclaimerConsentsPanel() {
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const load = async (q: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_list_ai_disclaimer_consents", {
      _search: q || null,
      _limit: 200,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as ConsentRow[]) ?? []);
  };

  useEffect(() => { load(""); }, []);

  const filtered = useMemo(() => rows, [rows]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("Няма записи за експорт.");
      return;
    }
    const header = ["user_id", "email", "display_name", "granted_at", "document_version", "session_id", "path", "user_agent"];
    const csv = [
      header.join(","),
      ...filtered.map((r) =>
        header
          .map((k) => {
            return escapeCell(r[k as keyof ConsentRow]);
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-disclaimer-consents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-gold" />
            Приети AI дисклеймъри по потребител
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(search); }}
                placeholder="Търси по имейл / име"
                className="h-8 w-56 pl-7 text-xs"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => load(search)} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Обнови"}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {busy && rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Няма записи.</p>
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Потребител</TableHead>
                  <TableHead className="text-xs">Дата</TableHead>
                  <TableHead className="text-xs">Версия</TableHead>
                  <TableHead className="text-xs">Session ID</TableHead>
                  <TableHead className="text-xs">Път</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={`${r.user_id}-${r.granted_at}-${i}`}>
                    <TableCell className="align-top">
                      <div className="text-xs font-medium">{r.display_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.email ?? r.user_id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell className="align-top text-xs tabular-nums">
                      {new Date(r.granted_at).toLocaleString("bg-BG")}
                    </TableCell>
                    <TableCell className="align-top text-xs">{r.document_version ?? "—"}</TableCell>
                    <TableCell className="align-top">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {r.session_id ? r.session_id.slice(0, 12) + "…" : "—"}
                      </code>
                    </TableCell>
                    <TableCell className="align-top text-[11px] text-muted-foreground">
                      {r.path ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
