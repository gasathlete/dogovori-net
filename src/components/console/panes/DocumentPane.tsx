import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, FileText, Save } from "@/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { AskDogovaryAIButton } from "@/components/console/AskDogovaryAIButton";

type SavedDoc = {
  id: string;
  title: string;
  kind: string;
  payload: any;
  created_at: string;
};

export function DocumentPane({ documentId, tabId }: { documentId: string; tabId?: string }) {
  const { setDirty } = useConsoleStore();
  const [doc, setDoc] = useState<SavedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [closing, setClosing] = useState("");
  const [sections, setSections] = useState<Array<{ heading?: string; body: string }>>([]);
  const [clauses, setClauses] = useState<Array<{ title?: string; body: string }>>([]);
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<"structured" | "raw">("structured");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("saved_documents")
        .select("*")
        .eq("id", documentId)
        .maybeSingle();
      const d = data as SavedDoc | null;
      setDoc(d);
      if (d) {
        setTitle(d.title || "");
        const p = d.payload || {};
        setIntro(p.intro || "");
        setClosing(p.closing || "");
        setSections(Array.isArray(p.sections) ? p.sections.map((s: any) => ({ heading: s.heading || "", body: s.body || "" })) : []);
        setClauses(Array.isArray(p.clauses) ? p.clauses.map((c: any) => ({ title: c.title || "", body: c.body || "" })) : []);
        const hasStructure = (Array.isArray(p.sections) && p.sections.length) || (Array.isArray(p.clauses) && p.clauses.length);
        setMode(hasStructure ? "structured" : "raw");
        if (!hasStructure) {
          setRawText(typeof p === "string" ? p : (p.text || JSON.stringify(p, null, 2)));
        }
      }
      setLoading(false);
    })();
  }, [documentId]);

  const markDirty = () => { if (tabId) setDirty(tabId, true); };

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    let payload: any = doc.payload || {};
    if (mode === "structured") {
      payload = { ...payload, intro, closing, sections, clauses };
    } else {
      try { payload = JSON.parse(rawText); } catch { payload = { ...payload, text: rawText }; }
    }
    const { error } = await supabase
      .from("saved_documents")
      .update({ title, payload })
      .eq("id", doc.id);
    setSaving(false);
    if (error) toast.error("Грешка", { description: error.message });
    else {
      toast.success("Запазено");
      if (tabId) setDirty(tabId, false);
    }
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-gold" /> {doc.kind}
          </div>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            className="mt-1 border-0 bg-transparent px-0 font-serif text-2xl font-bold focus-visible:ring-0"
            placeholder="(без заглавие)"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Създаден на {new Date(doc.created_at).toLocaleString("bg-BG")}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-gold text-navy">
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Запази
          </Button>
          <a
            href={`/document/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
          >
            <ExternalLink className="h-4 w-4" /> Пълен редактор
          </a>
          <AskDogovaryAIButton
            kind="saved_document"
            entityId={doc.id}
            displayTitle={title || doc.title || ""}
            tabId={tabId}
          />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {mode === "structured" ? (
          <>
            {intro !== undefined && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Уводен текст</label>
                <Textarea
                  value={intro}
                  onChange={(e) => { setIntro(e.target.value); markDirty(); }}
                  className="min-h-[80px] bg-card/40"
                />
              </div>
            )}

            {sections.map((s, i) => (
              <div key={`s-${i}`} className="rounded-lg border border-border/60 bg-card/30 p-3">
                <Input
                  value={s.heading || ""}
                  onChange={(e) => {
                    const next = [...sections]; next[i] = { ...next[i], heading: e.target.value }; setSections(next); markDirty();
                  }}
                  placeholder="Заглавие на секция"
                  className="mb-2 border-0 bg-transparent px-0 font-serif text-base font-bold focus-visible:ring-0"
                />
                <Textarea
                  value={s.body}
                  onChange={(e) => {
                    const next = [...sections]; next[i] = { ...next[i], body: e.target.value }; setSections(next); markDirty();
                  }}
                  className="min-h-[120px] bg-card/40 text-sm leading-relaxed"
                />
              </div>
            ))}

            {clauses.map((c, i) => (
              <div key={`c-${i}`} className="rounded-lg border border-border/60 bg-card/30 p-3">
                <Input
                  value={c.title || ""}
                  onChange={(e) => {
                    const next = [...clauses]; next[i] = { ...next[i], title: e.target.value }; setClauses(next); markDirty();
                  }}
                  placeholder="Заглавие на клауза"
                  className="mb-2 border-0 bg-transparent px-0 font-serif text-base font-bold focus-visible:ring-0"
                />
                <Textarea
                  value={c.body}
                  onChange={(e) => {
                    const next = [...clauses]; next[i] = { ...next[i], body: e.target.value }; setClauses(next); markDirty();
                  }}
                  className="min-h-[120px] bg-card/40 text-sm leading-relaxed"
                />
              </div>
            ))}

            {closing !== undefined && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Заключение</label>
                <Textarea
                  value={closing}
                  onChange={(e) => { setClosing(e.target.value); markDirty(); }}
                  className="min-h-[80px] bg-card/40"
                />
              </div>
            )}
          </>
        ) : (
          <Textarea
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); markDirty(); }}
            className="min-h-[60vh] bg-card/40 font-mono text-sm leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}
