import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
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
  action: "download" | "redownload";
  created_at: string;
  metadata: any;
  doc: SavedDoc | null;
};

export default function Downloads({ kind }: { kind: "contract" | "template" }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<DownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const heading = kind === "contract" ? "Свалени договори" : "Свалени бланки";
  const subtitle =
    kind === "contract"
      ? "Реален дневник на всички сваляния на договори — всеки запис е едно изтегляне."
      : "Реален дневник на всички сваляния на бланки и приложения — всеки запис е едно изтегляне.";

  const reload = async () => {
    if (!user) return;
    setLoading(true);

    // 1) Pull download/redownload events from the audit log — this is the
    //    source of truth that powers the dashboard counter and survives
    //    deletion of the underlying saved document.
    const { data: logs, error } = await supabase
      .from("audit_log")
      .select("id,target_id,action,created_at,metadata")
      .eq("user_id", user.id)
      .in("action", ["download", "redownload"])
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setLoading(false);
      toast.error("Грешка при зареждане", { description: error.message });
      return;
    }

    const filtered = ((logs as any[]) ?? []).filter((l) => l?.metadata?.kind === kind);

    // 2) Best-effort hydration of titles/payloads for re-download.
    const ids = Array.from(new Set(filtered.map((l) => l.target_id).filter(Boolean) as string[]));
    let byId: Record<string, SavedDoc> = {};
    if (ids.length) {
      const { data: docs } = await supabase
        .from("saved_documents")
        .select("id,title,kind,payload,created_at")
        .in("id", ids);
      for (const d of (docs as any[]) ?? []) byId[d.id] = d as SavedDoc;
    }

    setEvents(
      filtered.map((l) => ({
        id: l.id,
        target_id: l.target_id,
        action: l.action,
        created_at: l.created_at,
        metadata: l.metadata,
        doc: l.target_id ? byId[l.target_id] ?? null : null,
      })),
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

  return (
    <div className="min-h-screen">
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
        <div className="mt-1 text-xs text-muted-foreground">Общо записа: {events.length}</div>

        <div className="mt-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
              Все още няма записи за {kind === "contract" ? "сваляне на договори" : "сваляне на бланки"}.
            </div>
          ) : (
            <div className="grid gap-3">
              {events.map((ev) => {
                const title = ev.doc?.title ?? "(изтрит документ)";
                const isDeleted = !ev.doc;
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
                            <span>
                              {ev.action === "redownload" ? "Повторно сваляне (безплатно)" : "Сваляне (1 операция)"}
                            </span>
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
          )}
        </div>
      </main>
    </div>
  );
}
