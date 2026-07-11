import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Wand2, Loader2, Package } from "@/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { DetectedReference } from "@/lib/documentReferences";
import { linkChildToParent } from "@/lib/documentLinks";
import { AddToKitDialog } from "@/components/AddToKitDialog";

interface Props {
  reference: DetectedReference;
  parentSavedId: string | null;
  parentUploadedId: string | null;
  parentTitle?: string;
  parentContext?: {
    partiesA?: string[];
    partiesB?: string[];
    subject?: string;
  };
  onClose: () => void;
  onLinked: () => void;
}

const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";
const MAX_BYTES = 10 * 1024 * 1024;

export function ReferencePromptDialog({
  reference, parentSavedId, parentUploadedId, parentTitle, parentContext, onClose, onLinked,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);

  const handleUpload = async (file: File) => {
    if (!user) { toast.error("Влезте, за да качите документ"); return; }
    if (file.size > MAX_BYTES) { toast.error("Файлът надвишава 10 MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const storagePath = `${user.id}/appendices/${Date.now()}-${reference.id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("user-contracts")
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;

      // Persist as uploaded_contracts row so we can reference it via document_links.
      const { data: uploaded, error: insErr } = await supabase
        .from("uploaded_contracts")
        .insert({
          user_id: user.id,
          title: reference.displayLabel + (parentTitle ? ` (към ${parentTitle})` : ""),
          source: "appendix_upload",
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const linked = await linkChildToParent({
        user_id: user.id,
        parent: { saved_id: parentSavedId ?? undefined, uploaded_id: parentUploadedId ?? undefined },
        child: { uploaded_id: uploaded.id },
        ref_type: reference.type,
        ref_number: reference.number,
        ref_label: reference.displayLabel,
      });
      if ("error" in linked) throw new Error(linked.error);

      toast.success(`${reference.displayLabel} е прикачен`, {
        description: `Версия ${linked.version} — ще се добави към PDF при експорт.`,
      });
      onLinked();
      onClose();
    } catch (e: any) {
      toast.error("Грешка при качване", { description: String(e?.message ?? e) });
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = () => {
    const params = new URLSearchParams();
    params.set("documentType", reference.documentTypeId);
    if (reference.number !== null) params.set("refNumber", String(reference.number));
    if (parentSavedId) params.set("parentSavedId", parentSavedId);
    if (parentUploadedId) params.set("parentUploadedId", parentUploadedId);
    if (parentTitle) params.set("parentTitle", parentTitle);
    params.set("refType", reference.type);
    if (parentContext?.partiesA?.length) params.set("partiesA", parentContext.partiesA.join("\n"));
    if (parentContext?.partiesB?.length) params.set("partiesB", parentContext.partiesB.join("\n"));
    if (parentContext?.subject) params.set("subject", parentContext.subject);
    navigate(`/build?${params.toString()}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Разполагате ли с „{reference.displayLabel}"?</DialogTitle>
          <DialogDescription>
            Документът е посочен в основния договор. Изберете дали да го качите (ако вече го имате) или да го изготвите с AI.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/20 ${uploading ? "pointer-events-none opacity-50" : ""}`}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Да, имам го — качи файл
            <input
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
          </label>
          <Button
            onClick={handleGenerate}
            className="w-full bg-gradient-gold text-navy hover:shadow-gold"
          >
            <Wand2 className="mr-2 h-4 w-4" /> Не — изготви го с AI
          </Button>
          <Button
            onClick={handleGenerate}
            className="w-full bg-gradient-gold text-navy hover:shadow-gold"
          >
            <Wand2 className="mr-2 h-4 w-4" /> Не — изготви го с AI
          </Button>
          {user && (
            <Button
              variant="outline"
              onClick={() => setKitOpen(true)}
              className="w-full border-gold/30 text-gold hover:bg-gold/10"
            >
              <Package className="mr-2 h-4 w-4" /> Добави в комплект
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="w-full text-xs text-muted-foreground">
            Отказ
          </Button>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Прикачените документи се добавят автоматично към основния договор при експорт в PDF и се запазват с версия в профила ви.
        </p>
      </DialogContent>
      {kitOpen && (
        <AddToKitDialog
          open={kitOpen}
          onClose={() => setKitOpen(false)}
          defaultKitTitle={parentTitle ? `Комплект: ${parentTitle}` : reference.displayLabel}
          item={{
            role: "appendix",
            ref_label: reference.displayLabel,
            planned_doc_name: reference.displayLabel,
          }}
          onAdded={() => { onLinked(); onClose(); }}
        />
      )}
    </Dialog>
  );
}
