import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, Loader2, Trash2 } from "lucide-react";
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

export default function Downloads({ kind }: { kind: "contract" | "template" }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const heading = kind === "contract" ? "Свалени документи" : "Свалени бланки";
  const subtitle =
    kind === "contract"
      ? "Всички договори, които сте генерирали и свалили."
      : "Всички бланки и приложения, които сте свалили.";

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_documents")
      .select("id,title,kind,payload,created_at")
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Грешка при зареждане", { description: error.message });
      return;
    }
    setDocs((data as any) ?? []);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind]);

  const redownload = async (d: SavedDoc, format: "pdf" | "docx") => {
    setBusy(d.id + format);
    const res = await downloadDocument({
      kind: d.kind,
      format,
      title: d.title,
      payload: d.payload,
      saved_document_id: d.id,
    });
    setBusy(null);
    if (!res.ok) toast.error("Грешка", { description: res.error });
    else toast.success("Изтеглен (безплатно)");
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    const { error } = await supabase.from("saved_documents").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Изтрит");
      reload();
    }
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

        <div className="mt-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
              Все още няма {kind === "contract" ? "свалени договори" : "свалени бланки"}.
            </div>
          ) : (
            <div className="grid gap-3">
              {docs.map((d) => (
                <Link
                  key={d.id}
                  to={`/document/${d.id}`}
                  className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        <div className="min-w-0">
                          <div className="break-words font-serif text-base font-bold">{d.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("bg-BG")}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9"
                        disabled={busy === d.id + "pdf"}
                        onClick={() => redownload(d, "pdf")}
                      >
                        {busy === d.id + "pdf" ? (
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
                        disabled={busy === d.id + "docx"}
                        onClick={() => redownload(d, "docx")}
                      >
                        {busy === d.id + "docx" ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="mr-1 h-3 w-3" />
                        )}{" "}
                        DOCX
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 text-destructive"
                        onClick={() => remove(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
