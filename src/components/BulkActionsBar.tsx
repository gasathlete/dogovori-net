import { useMemo, useState } from "react";
import { CheckSquare, Square, Loader2, FileArchive, X, Trash2, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useIsPro } from "@/hooks/useIsPro";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { bulkDownloadAsZip, type BulkFormat } from "@/lib/bulkDownload";
import { supabase } from "@/integrations/supabase/client";

type Doc = {
  id: string;
  title: string;
  kind: "contract" | "template";
  payload: unknown;
  user_id?: string | null;
};

type FolderOpt = { id: string; name: string };

interface Props {
  docs: Doc[];
  /** Controlled selection state (parent owns it so a checkbox can live on each row). */
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  /** Current user id — used to gate bulk delete to documents the user owns. */
  currentUserId?: string | null;
  /** Folders the user can move selected documents into. */
  folders?: FolderOpt[];
  /** Called after a successful bulk delete so the parent can refresh its list. */
  onChanged?: () => void;
}

export function BulkActionsBar({
  docs,
  selectionMode,
  setSelectionMode,
  selectedIds,
  setSelectedIds,
  currentUserId,
  folders = [],
  onChanged,
}: Props) {
  const { isPro } = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [busy, setBusy] = useState<BulkFormat | "delete" | "move" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const selectableIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const allSelected = selectedIds.length > 0 && selectedIds.length === selectableIds.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(selectableIds);
  };

  const runBulk = async (format: BulkFormat) => {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    if (!selectedIds.length) {
      toast.info("Избери поне един документ");
      return;
    }
    setBusy(format);
    setProgress({ done: 0, total: selectedIds.length });
    try {
      // Hydrate payloads from DB for the chosen items, in case parent only
      // passed lightweight rows. Falls back to in-memory payload if present.
      const missing = selectedIds.filter((id) => {
        const d = docs.find((x) => x.id === id);
        return !d || !d.payload;
      });
      let fetched: Record<string, unknown> = {};
      if (missing.length) {
        const { data } = await supabase
          .from("saved_documents")
          .select("id,payload")
          .in("id", missing);
        for (const row of (data ?? []) as Array<{ id: string; payload: unknown }>) {
          fetched[row.id] = row.payload;
        }
      }
      const items = selectedIds
        .map((id) => docs.find((x) => x.id === id))
        .filter((d): d is Doc => !!d)
        .map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          payload: (d.payload as any) ?? (fetched[d.id] as any),
        }))
        .filter((d) => !!d.payload);

      const res = await bulkDownloadAsZip({
        items: items as any,
        format,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (!res.ok) {
        toast.error("Неуспешно", { description: res.error });
      } else {
        toast.success(`ZIP е готов · ${res.zipped} документа${res.failed ? ` (${res.failed} пропуснати)` : ""}`);
        setSelectedIds([]);
        setSelectionMode(false);
      }
    } catch (e) {
      toast.error("Грешка", { description: String((e as Error).message ?? e) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const ownedSelectedIds = useMemo(() => {
    if (!currentUserId) return [] as string[];
    return selectedIds.filter((id) => {
      const d = docs.find((x) => x.id === id);
      // allow when ownership unknown (legacy rows) or matches current user
      return !d?.user_id || d.user_id === currentUserId;
    });
  }, [selectedIds, docs, currentUserId]);

  const runBulkDelete = async () => {
    if (!selectedIds.length) {
      toast.info("Избери поне един документ");
      return;
    }
    const skipped = selectedIds.length - ownedSelectedIds.length;
    if (!ownedSelectedIds.length) {
      toast.error("Нямаш права да изтриеш избраните документи");
      return;
    }
    if (!confirm(
      `Сигурни ли сте, че искате да изтриете ${ownedSelectedIds.length} документ${ownedSelectedIds.length === 1 ? "" : "а"}?` +
      (skipped ? `\n(${skipped} ще бъдат пропуснати — не са ваши)` : ""),
    )) return;
    setBusy("delete");
    try {
      const { error } = await supabase
        .from("saved_documents")
        .delete()
        .in("id", ownedSelectedIds);
      if (error) {
        toast.error("Неуспешно изтриване", { description: error.message });
      } else {
        toast.success(`Изтрити ${ownedSelectedIds.length} документ${ownedSelectedIds.length === 1 ? "" : "а"}`);
        setSelectedIds([]);
        setSelectionMode(false);
        onChanged?.();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-gradient-card p-2.5 sm:p-3">
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-card/60"
                aria-label={allSelected ? "Размаркирай всички" : "Маркирай всички"}
              >
                {allSelected ? <CheckSquare className="h-4 w-4 text-gold" /> : <Square className="h-4 w-4" />}
                {allSelected ? "Размаркирай всички" : "Маркирай всички"}
              </button>
              <span className="text-xs text-muted-foreground">
                · избрани {selectedIds.length}/{docs.length}
              </span>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => {
                if (!isPro) { setPaywallOpen(true); return; }
                setSelectionMode(true);
              }}
            >
              <FileArchive className="mr-1.5 h-3.5 w-3.5" />
              Избери за ZIP
              {!isPro && (
                <span className="ml-2 inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                  PRO
                </span>
              )}
            </Button>
          )}
        </div>

        {selectionMode && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!!busy || selectedIds.length === 0}
              onClick={() => runBulk("pdf")}
              className="h-9 bg-gradient-gold text-navy hover:shadow-gold"
            >
              {busy === "pdf" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileArchive className="mr-1.5 h-3.5 w-3.5" />}
              ZIP · PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || selectedIds.length === 0}
              onClick={() => runBulk("docx")}
              className="h-9"
            >
              {busy === "docx" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileArchive className="mr-1.5 h-3.5 w-3.5" />}
              ZIP · DOCX
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || ownedSelectedIds.length === 0}
              onClick={runBulkDelete}
              className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10"
              title={ownedSelectedIds.length === 0 ? "Маркирай свои документи" : `Изтрий ${ownedSelectedIds.length}`}
            >
              {busy === "delete" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Изтрий{ownedSelectedIds.length > 0 ? ` (${ownedSelectedIds.length})` : ""}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => { setSelectionMode(false); setSelectedIds([]); }}
              disabled={!!busy}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Отказ
            </Button>
            {progress && busy && (
              <span className="text-xs text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            )}
          </div>
        )}
      </div>
      <ProUpgradeDialog open={paywallOpen} onOpenChange={setPaywallOpen} trigger="bulk_zip" />
    </>
  );
}

interface RowCheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function BulkRowCheckbox({ checked, onChange }: RowCheckboxProps) {
  return (
    <div
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
      className="flex h-6 w-6 shrink-0 items-center justify-center"
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} aria-label="Избери документ" />
    </div>
  );
}
