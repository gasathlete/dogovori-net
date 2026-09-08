import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, FileUp, Save, Package } from "@/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { AddToKitDialog } from "@/components/AddToKitDialog";
import { AskDogovaryAIButton } from "@/components/console/AskDogovaryAIButton";

export function UploadedPane({ uploadedId, tabId }: { uploadedId: string; tabId?: string }) {
  const { setDirty } = useConsoleStore();
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [kitOpen, setKitOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("uploaded_contracts")
        .select("*")
        .eq("id", uploadedId)
        .maybeSingle();
      setDoc(data);
      if (data) {
        setTitle(data.title || data.original_filename || "");
        setText(data.extracted_text || "");
      }
      setLoading(false);
    })();
  }, [uploadedId]);

  const markDirty = () => { if (tabId) setDirty(tabId, true); };

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    const { error } = await supabase
      .from("uploaded_contracts")
      .update({ title, extracted_text: text })
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
    return <div className="p-6 text-sm text-muted-foreground">Качването не е намерено.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileUp className="h-3.5 w-3.5 text-gold" /> Качен документ
          </div>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            className="mt-1 border-0 bg-transparent px-0 font-serif text-2xl font-bold focus-visible:ring-0"
            placeholder="(без заглавие)"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Качен на {new Date(doc.created_at).toLocaleString("bg-BG")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-gold text-navy">
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Запази
          </Button>
          <button
            onClick={() => setKitOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold hover:bg-gold/20"
          >
            <Package className="h-4 w-4" /> Добави в комплект
          </button>
          <a
            href={`/uploaded/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
          >
            <ExternalLink className="h-4 w-4" /> Анализ
          </a>
          <AskDogovaryAIButton
            kind="uploaded_contract"
            entityId={doc.id}
            displayTitle={title || doc.original_filename || ""}
            tabId={tabId}
          />
        </div>
      </div>

      <AddToKitDialog
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        defaultKitTitle={title || doc.original_filename || "Качен документ"}
        item={{
          role: "primary",
          ref_label: title || doc.original_filename || "Качен документ",
          uploaded_id: doc.id,
        }}
      />

      <div className="mt-6">
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Текст на документа</label>
        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); markDirty(); }}
          className="min-h-[65vh] bg-card/40 font-sans text-sm leading-relaxed"
          placeholder="Няма извлечен текст"
        />
      </div>
    </div>
  );
}
