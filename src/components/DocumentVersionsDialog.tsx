import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, History, RotateCcw, Trash2 } from "@/icons";

type Version = {
  id: string;
  saved_document_id: string;
  title: string;
  payload: any;
  version_no: number;
  created_at: string;
};

export function DocumentVersionsDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string | null;
  documentTitle?: string;
  onRestored?: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    supabase
      .from("document_versions")
      .select("*")
      .eq("saved_document_id", documentId)
      .order("version_no", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Грешка при зареждане на историята");
        else setVersions((data as Version[]) || []);
        setLoading(false);
      });
  }, [open, documentId]);

  const restore = async (v: Version) => {
    if (!documentId) return;
    if (!confirm(`Възстановяване към версия #${v.version_no}? Текущата версия ще бъде записана в историята.`)) return;
    setBusyId(v.id);
    const { error } = await supabase
      .from("saved_documents")
      .update({ title: v.title, payload: v.payload })
      .eq("id", documentId);
    setBusyId(null);
    if (error) {
      toast.error("Възстановяването не успя");
      return;
    }
    toast.success(`Възстановена е версия #${v.version_no}`);
    onRestored?.();
    onOpenChange(false);
  };

  const remove = async (v: Version) => {
    if (!confirm(`Изтриване на версия #${v.version_no}?`)) return;
    setBusyId(v.id);
    const { error } = await supabase.from("document_versions").delete().eq("id", v.id);
    setBusyId(null);
    if (error) toast.error("Изтриването не успя");
    else setVersions((prev) => prev.filter((x) => x.id !== v.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            История на версиите
          </DialogTitle>
          {documentTitle && (
            <p className="text-xs text-muted-foreground truncate">{documentTitle}</p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Все още няма запазени по-стари версии. Версиите се създават автоматично при редакция.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Версия #{v.version_no}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.title}</p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {new Date(v.created_at).toLocaleString("bg-BG")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restore(v)}
                    disabled={busyId === v.id}
                  >
                    {busyId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1 hidden sm:inline">Възстанови</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(v)}
                    disabled={busyId === v.id}
                    aria-label="Изтрий версия"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Затвори
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
