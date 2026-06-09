import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, Info, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadDocument } from "@/lib/downloadDocument";

type SavedDoc = {
  id: string;
  title: string;
  kind: "contract" | "template";
  payload: any;
  created_at: string;
};

type DownloadEvent = {
  id: string;
  target_id: string | null;
  action: "download" | "redownload" | "saved";
  created_at: string;
  metadata: any;
  doc: SavedDoc | null;
};

export default function Downloads({ kind }: { kind: "contract" | "template" }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<DownloadEvent[]>([]);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const heading = kind === "contract" ? "Свалени договори" : "Свалени бланки";
  const subtitle =
    kind === "contract"
      ? "Лична история на всички сваляния на договори от вашия профил."
      : "Лична история на всички сваляния на бланки и приложения от вашия профил.";

  const reload = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch in parallel:
    // 1) audit_log download/redownload events (activity history, source of truth
    //    for the counter on /account dashboard for new flows).
    // 2) saved_documents of this kind — the actual artefacts the user can
    //    re-download for free. We surface these as separate "saved" rows when
    //    they have no matching audit_log event, so legacy downloads (pre-audit
    //    instrumentation) and template saves still show up.
    // 3) download_quota counter so we can explain any historical-only difference.
    const [logsRes, savedRes, quotaRes] = await Promise.all([
      supabase
        .from("audit_log")
        .select("id,target_id,action,created_at,metadata")
        .eq("user_id", user.id)
        .in("action", ["download", "redownload"])
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("saved_documents")
        .select("id,title,kind,payload,created_at")
        .eq("user_id", user.id)
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("download_quota")
        .select("contracts_used,templates_used")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (logsRes.error) {
      setLoading(false);
      toast.error("Грешка при зареждане", { description: logsRes.error.message });
      return;
    }

    const allSaved = ((savedRes.data as any[]) ?? []) as SavedDoc[];
    const byId: Record<string, SavedDoc> = {};
    for (const d of allSaved) byId[d.id] = d;

    const logs = ((logsRes.data as any[]) ?? []).filter((l) => l?.metadata?.kind === kind);

    // Merge: audit log events first; then any saved_document that has no
    // corresponding "download" event (e.g. legacy or imported saves) added as
    // a virtual "saved" row so the user can still re-download.
    const seenDocIds = new Set<string>();
    for (const l of logs) if (l.target_id) seenDocIds.add(l.target_id as string);

    const merged: DownloadEvent[] = [
      ...logs.map((l) => ({
        id: l.id,
        target_id: l.target_id,
        action: l.action,
        created_at: l.created_at,
        metadata: l.metadata,
        doc: l.target_id ? byId[l.target_id] ?? null : null,
      })),
      ...allSaved
        .filter((d) => !seenDocIds.has(d.id))
        .map<DownloadEvent>((d) => ({
          id: `saved:${d.id}`,
          target_id: d.id,
          action: "saved",
          created_at: d.created_at,
          metadata: { kind, legacy: true },
          doc: d,
        })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    setEvents(merged);
    setQuotaUsed(
      kind === "contract"
        ? (quotaRes.data as any)?.contracts_used ?? 0
        : (quotaRes.data as any)?.templates_used ?? 0,
    );
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind]);

  const redownload = async (ev: DownloadEvent, format: "pdf" | "docx") => {
    if (!ev.doc) {
      toast.error("Документът вече не съществува", {
        description: "Изтрит е от профила, повторно сваляне не е възможно.",
      });
      return;
    }
    setBusy(ev.id + format);
    const res = await downloadDocument({
      kind: ev.doc.kind,
      format,
      title: ev.doc.title,
      payload: ev.doc.payload,
      saved_document_id: ev.doc.id,
    });
    setBusy(null);
    if (!res.ok) toast.error("Грешка", { description: res.error });
    else toast.success("Изтеглен (безплатно)");
  };

  // Historical-only counter delta = quota counter minus what we can list.
  // Happens when downloads were charged before audit logging was instrumented
  // (legacy data) or via tools that did not persist a saved_document.
  const legacyDelta = Math.max(0, (quotaUsed ?? 0) - events.length);

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/account"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Към таблото
        </Link>
        <h1 className="font-serif text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-1 text-xs text-muted-foreground">
          Общо записа: {events.length}
          {quotaUsed !== null && quotaUsed !== events.length && (
            <span> · Брояч в профила: {quotaUsed}</span>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
              {quotaUsed && quotaUsed > 0 ? (
                <>
                  <Info className="mx-auto mb-2 h-5 w-5 text-gold" />
                  Брояч в профила: <strong>{quotaUsed}</strong>{" "}
                  {kind === "contract" ? "свалени договора" : "свалени бланки"}, но няма запазени детайли за всеки запис.
                  <div className="mt-2 text-xs text-muted-foreground/80">
                    Тези сваляния са направени преди да започнем да съхраняваме детайлна история на всеки документ. Новите сваляния ще се показват тук с опция за повторно сваляне.
                  </div>
                </>
              ) : (
                <>Все още няма записи за {kind === "contract" ? "сваляне на договори" : "сваляне на бланки"}.</>
              )}
            </div>
          ) : (
            <>
              {legacyDelta > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/[0.04] p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                  <span>
                    Още <strong>{legacyDelta}</strong>{" "}
                    {kind === "contract" ? "сваляния на договори" : "сваляния на бланки"} са регистрирани в брояча, но без запазени детайли (исторически сваляния отпреди детайлното логване). Те не могат да бъдат изтеглени повторно от тук.
                  </span>
                </div>
              )}
              <div className="grid gap-3">
                {events.map((ev) => {
                  const title = ev.doc?.title ?? "(изтрит документ)";
                  const isDeleted = !ev.doc;
                  const isSavedOnly = ev.action === "saved";
                  const actionLabel = isSavedOnly
                    ? "Запазен в профила · повторно сваляне (безплатно)"
                    : ev.action === "redownload"
                    ? "Повторно сваляне (безплатно)"
                    : "Сваляне (1 операция)";
                  const content = (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                          <div className="min-w-0">
                            <div className="break-words font-serif text-base font-bold">
                              {title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {new Date(ev.created_at).toLocaleString("bg-BG", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span>·</span>
                              <span>{actionLabel}</span>
                              {isDeleted && (
                                <>
                                  <span>·</span>
                                  <span className="text-destructive">документът е изтрит</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {!isDeleted && (
                        <div
                          className="flex flex-wrap items-center gap-1.5"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            disabled={busy === ev.id + "pdf"}
                            onClick={() => redownload(ev, "pdf")}
                          >
                            {busy === ev.id + "pdf" ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3 w-3" />
                            )}{" "}
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            disabled={busy === ev.id + "docx"}
                            onClick={() => redownload(ev, "docx")}
                          >
                            {busy === ev.id + "docx" ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3 w-3" />
                            )}{" "}
                            DOCX
                          </Button>
                        </div>
                      )}
                    </div>
                  );

                  return ev.doc ? (
                    <Link
                      key={ev.id}
                      to={`/document/${ev.doc.id}`}
                      className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-border/60 bg-gradient-card p-4 opacity-80"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
