import { useEffect, useState } from "react";
import { Loader2, Package, Plus } from "@/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { addItemToKit, createKit, listMyKits, type UserKit } from "@/lib/kits";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Suggested label/title for the new kit, e.g. parent document title. */
  defaultKitTitle?: string;
  /** Item that will be added to the chosen kit. */
  item: {
    role: "primary" | "appendix" | "companion";
    ref_label: string;
    saved_id?: string;
    uploaded_id?: string;
    planned_doc_name?: string;
  };
  onAdded?: (kitId: string) => void;
}

export function AddToKitDialog({ open, onClose, defaultKitTitle, item, onAdded }: Props) {
  const { user } = useAuth();
  const [kits, setKits] = useState<UserKit[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState(defaultKitTitle ?? "");
  const [mode, setMode] = useState<"pick" | "new">("pick");

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    listMyKits(user.id)
      .then((all) => {
        const active = all.filter((k) => k.status === "in_progress");
        setKits(active);
        setMode(active.length === 0 ? "new" : "pick");
      })
      .finally(() => setLoading(false));
  }, [open, user]);

  useEffect(() => { setNewTitle(defaultKitTitle ?? ""); }, [defaultKitTitle]);

  if (!user) return null;

  const handleAdd = async (kit: UserKit) => {
    setCreating(true);
    try {
      const added = await addItemToKit({
        kit_id: kit.id,
        role: item.role,
        ref_label: item.ref_label,
        saved_id: item.saved_id,
        uploaded_id: item.uploaded_id,
        planned_doc_name: item.planned_doc_name,
      });
      if (!added) {
        toast.error("Не успяхме да добавим в комплекта");
        return;
      }
      toast.success(`Добавено в „${kit.title}"`);
      onAdded?.(kit.id);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTitle.trim()) {
      toast.error("Въведете име на комплекта");
      return;
    }
    setCreating(true);
    try {
      const kit = await createKit({ user_id: user.id, title: newTitle.trim() });
      if (!kit) {
        toast.error("Не успяхме да създадем комплекта");
        return;
      }
      await addItemToKit({
        kit_id: kit.id,
        role: item.role,
        ref_label: item.ref_label,
        saved_id: item.saved_id,
        uploaded_id: item.uploaded_id,
        planned_doc_name: item.planned_doc_name,
      });
      toast.success(`Създаден „${kit.title}" и добавен документ`);
      onAdded?.(kit.id);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gold" /> Добави в комплект
          </DialogTitle>
          <DialogDescription>
            Групирайте свързани документи (основен договор, приложения, придружаващи) на едно място.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-4">
            {kits.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("pick")}
                  className={
                    mode === "pick"
                      ? "rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold"
                      : "rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:text-gold"
                  }
                >
                  Съществуващ ({kits.length})
                </button>
                <button
                  onClick={() => setMode("new")}
                  className={
                    mode === "new"
                      ? "rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold"
                      : "rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:text-gold"
                  }
                >
                  Нов
                </button>
              </div>
            )}

            {mode === "pick" && kits.length > 0 && (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {kits.map((k) => (
                  <li key={k.id}>
                    <button
                      disabled={creating}
                      onClick={() => handleAdd(k)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2.5 text-left transition-colors hover:border-gold/40 hover:bg-card/70 disabled:opacity-50"
                    >
                      <span className="line-clamp-1 text-sm text-foreground">{k.title}</span>
                      <Plus className="h-4 w-4 text-gold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {mode === "new" && (
              <div className="space-y-3">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Име на комплекта (напр. Сделка с офис №14)"
                  className="h-10"
                />
                <Button
                  onClick={handleCreateAndAdd}
                  disabled={creating || !newTitle.trim()}
                  className="w-full bg-gradient-gold text-navy hover:shadow-gold"
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Създай и добави
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
