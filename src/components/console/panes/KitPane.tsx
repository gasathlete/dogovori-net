import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, Package, FileText, CheckCircle2, Download, PenSquare,
  ExternalLink, ArrowRight, Trash2, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getKitWithItems, kitProgress, setKitStatus, deleteKit,
  type UserKitItem, type UserKitWithItems,
} from "@/lib/kits";
import { exportKitMergedPdf, triggerPdfDownload } from "@/lib/kitExport";
import { allTemplates } from "@/lib/templateIndex";
import { useConsoleStore } from "@/hooks/useConsoleStore";

interface Props {
  kitId: string;
  tabId: string;
}

export function KitPane({ kitId, tabId }: Props) {
  const { closeTab } = useConsoleStore() as any;
  const [kit, setKit] = useState<UserKitWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"export" | "complete" | "archive" | "delete" | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getKitWithItems(kitId).then((k) => {
      if (active) {
        setKit(k);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [kitId]);

  const templatesIndex = useMemo(() => {
    const m = new Map<string, { slug: string }>();
    for (const t of allTemplates()) m.set(t.doc.name, { slug: t.slug });
    return m;
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Package className="h-8 w-8" />
        Комплектът не е намерен.
      </div>
    );
  }

  const progress = kitProgress(kit.items);
  const isComplete = progress.done === progress.total && progress.total > 0;

  const grouped: Record<UserKitItem["role"], UserKitItem[]> = {
    primary: kit.items.filter((i) => i.role === "primary"),
    appendix: kit.items.filter((i) => i.role === "appendix"),
    companion: kit.items.filter((i) => i.role === "companion"),
  };

  const handleExport = async () => {
    setBusy("export");
    try {
      const res = await exportKitMergedPdf(kit.id);
      triggerPdfDownload(res.bytes, `${kit.title}.pdf`);
      toast.success(
        `Изтеглено: ${res.appended} документ(а)${res.skipped ? `, пропуснати ${res.skipped}` : ""}`,
      );
    } catch (e: any) {
      toast.error("Експортът не успя", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async () => {
    setBusy("complete");
    const ok = await setKitStatus(kit.id, "complete");
    setBusy(null);
    if (ok) {
      toast.success("Маркиран като завършен");
      setKit({ ...kit, status: "complete" });
    } else toast.error("Грешка");
  };

  const handleArchive = async () => {
    setBusy("archive");
    const ok = await setKitStatus(kit.id, "archived");
    setBusy(null);
    if (ok) {
      toast.success("Архивиран");
      setKit({ ...kit, status: "archived" });
    } else toast.error("Грешка");
  };

  const handleDelete = async () => {
    if (!confirm("Изтриване на комплекта? Записаните документи остават в профила.")) return;
    setBusy("delete");
    const ok = await deleteKit(kit.id);
    setBusy(null);
    if (ok) {
      toast.success("Изтрит");
      try { closeTab?.(tabId); } catch {}
    } else toast.error("Грешка");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
            {kit.status === "in_progress" ? "В процес" : kit.status === "complete" ? "Завършен" : "Архив"}
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-serif text-2xl font-bold">
            <Package className="h-5 w-5 text-gold" />
            {kit.title}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Прогрес: {progress.done} / {progress.total} документа · обновен{" "}
            {new Date(kit.updated_at).toLocaleDateString("bg-BG")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/komplekti/moi/${kit.id}`}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Отвори в профила
            </Link>
          </Button>
          <Button
            onClick={handleExport}
            disabled={!!busy || progress.done === 0}
            size="sm"
            className="bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
            title={progress.done === 0 ? "Първо попълнете поне един документ" : "Изтегли обединено PDF"}
          >
            {busy === "export" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            Експорт PDF
          </Button>
          {kit.status !== "complete" && (
            <Button onClick={handleComplete} disabled={!!busy} size="sm" variant="outline" className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Завърши
            </Button>
          )}
          {kit.status !== "archived" && (
            <Button onClick={handleArchive} disabled={!!busy} size="sm" variant="ghost" className="text-muted-foreground">
              <Archive className="mr-1 h-3.5 w-3.5" /> Архивирай
            </Button>
          )}
          <Button onClick={handleDelete} disabled={!!busy} size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10">
            <Trash2 className="mr-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sign hint */}
      {isComplete ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
          <PenSquare className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Готов за подпис</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Подпишете отделните документи поотделно — всеки запис се обработва като отделен плик
              за подпис. Отворете документа и натиснете „Изпрати за подпис".
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-border/60 bg-card/30 p-4 text-xs text-muted-foreground">
          За електронен подпис на целия комплект, първо попълнете всички документи.
        </div>
      )}

      {/* Items */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ItemColumn label="Основен документ" items={grouped.primary} kitId={kit.id} templatesIndex={templatesIndex} />
        <ItemColumn label="Приложения" items={grouped.appendix} kitId={kit.id} templatesIndex={templatesIndex} />
        <ItemColumn label="Придружаващи" items={grouped.companion} kitId={kit.id} templatesIndex={templatesIndex} />
      </div>
    </div>
  );
}

function ItemColumn({
  label, items, kitId, templatesIndex,
}: {
  label: string;
  items: UserKitItem[];
  kitId: string;
  templatesIndex: Map<string, { slug: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
        {label} ({items.length})
      </h2>
      <ul className="space-y-2">
        {items.map((it) => {
          const name = it.planned_doc_name || it.ref_label;
          const t = name ? templatesIndex.get(name) : undefined;
          const done = !!(it.saved_id || it.uploaded_id);
          const target = it.saved_id
            ? `/account?tab=documents`
            : it.uploaded_id
              ? `/account?tab=documents`
              : t
                ? `/shablon/${t.slug}?kit=${kitId}`
                : null;
          const inner = (
            <>
              <div className="flex items-start gap-3">
                {done
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />}
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">{name}</span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {done ? "Готов" : "Очаква попълване"}
                  </p>
                </div>
              </div>
              {target && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold opacity-60" />}
            </>
          );
          return (
            <li key={it.id}>
              {target ? (
                <Link
                  to={target}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3 transition-colors hover:border-gold/40 hover:bg-card/70"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3 opacity-70">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
