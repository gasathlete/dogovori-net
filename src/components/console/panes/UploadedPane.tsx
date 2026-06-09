import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, FileUp } from "lucide-react";

export function UploadedPane({ uploadedId }: { uploadedId: string }) {
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("uploaded_contracts")
        .select("*")
        .eq("id", uploadedId)
        .maybeSingle();
      setDoc(data);
      setLoading(false);
    })();
  }, [uploadedId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return <div className="p-6 text-sm text-muted-foreground">Качването не е намерено.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileUp className="h-3.5 w-3.5 text-gold" /> Качен документ
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold">
            {doc.title || doc.original_filename || "(без заглавие)"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Качен на {new Date(doc.created_at).toLocaleString("bg-BG")}
          </p>
        </div>
        <a
          href={`/uploaded/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
        >
          <ExternalLink className="h-4 w-4" /> Отвори анализ
        </a>
      </div>

      {doc.extracted_text && (
        <article className="mt-6 max-h-[60vh] overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-6">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{doc.extracted_text}</pre>
        </article>
      )}
    </div>
  );
}
