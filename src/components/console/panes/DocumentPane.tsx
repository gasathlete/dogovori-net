import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, FileText } from "lucide-react";

export function DocumentPane({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("saved_documents")
        .select("*")
        .eq("id", documentId)
        .maybeSingle();
      setDoc(data);
      setLoading(false);
    })();
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return <div className="p-6 text-sm text-muted-foreground">Документът не е намерен.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-gold" /> {doc.kind}
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold">{doc.title || "(без заглавие)"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Създаден на {new Date(doc.created_at).toLocaleString("bg-BG")}
          </p>
        </div>
        <a
          href={`/document/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
        >
          <ExternalLink className="h-4 w-4" /> Отвори в редактор
        </a>
      </div>

      {doc.content && (
        <article className="prose prose-invert mt-6 max-w-none rounded-xl border border-border/60 bg-card/40 p-6">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{
            typeof doc.content === "string" ? doc.content : JSON.stringify(doc.content, null, 2)
          }</pre>
        </article>
      )}
    </div>
  );
}
