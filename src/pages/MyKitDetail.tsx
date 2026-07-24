import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, FileText, Loader2, Package, PenSquare, Plus, X, Lock } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import {
  getKitWithItems,
  kitProgress,
  setKitStatus,
  renameKit,
  removeItemFromKit,
  kitHasSigningRequests,
  type UserKitItem,
  type UserKitWithItems,
} from "@/lib/kits";
import { getKit } from "@/data/documentKits";
import { allTemplates } from "@/lib/templateIndex";
import { toast } from "sonner";
import { exportKitMergedPdf, triggerPdfDownload } from "@/lib/kitExport";
import { KitBulkSigningDialog } from "@/components/KitBulkSigningDialog";

export default function MyKitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isPro } = useIsPro();
  const [kit, setKit] = useState<UserKitWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [bulkSignOpen, setBulkSignOpen] = useState(false);
  const [signedLocked, setSignedLocked] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getKitWithItems(id)
      .then(async (k) => {
        setKit(k);
        if (k) {
          const locked = await kitHasSigningRequests(k.items);
          setSignedLocked(locked);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const templatesIndex = useMemo(() => {
    const m = new Map<string, { slug: string }>();
    for (const t of allTemplates()) m.set(t.doc.name, { slug: t.slug });
    return m;
  }, []);

  if (!authLoading && !user) {
    return <Navigate to={`/auth?next=/komplekti/moi/${id ?? ""}`} replace />;
  }

  if (loading || authLoading) {
    return (
      <>
        <Header />
        <main className="container flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </>
    );
  }

  if (!kit) return <Navigate to="/komplekti" replace />;

  const tpl = kit.source_kit_id ? getKit(kit.source_kit_id) : undefined;
  const progress = kitProgress(kit.items);

  const grouped = {
    primary: kit.items.filter((i) => i.role === "primary"),
    appendix: kit.items.filter((i) => i.role === "appendix"),
    companion: kit.items.filter((i) => i.role === "companion"),
  };

  const handleArchive = async () => {
    const ok = await setKitStatus(kit.id, "archived");
    if (ok) {
      toast.success("Комплектът е архивиран");
      setKit({ ...kit, status: "archived" });
    }
  };
  const handleComplete = async () => {
    const ok = await setKitStatus(kit.id, "complete");
    if (ok) {
      toast.success("Комплектът е маркиран като завършен");
      setKit({ ...kit, status: "complete" });
    }
  };

  const handleExport = async () => {
    if (!kit) return;
    setExporting(true);
    try {
      const res = await exportKitMergedPdf(kit.id);
      triggerPdfDownload(res.bytes, `${kit.title}.pdf`);
      toast.success(
        `Изтеглено: ${res.appended} документ(а)${res.skipped ? `, пропуснати ${res.skipped}` : ""}`,
      );
    } catch (e: any) {
      toast.error("Експортът не успя", { description: e?.message });
    } finally {
      setExporting(false);
    }
  };

  const isComplete = progress.total > 0 && progress.done === progress.total;
  const editable = !signedLocked && kit.status === "in_progress";

  const beginRename = () => {
    setTitleDraft(kit.title);
    setEditingTitle(true);
  };
  const saveRename = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === kit.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    const ok = await renameKit(kit.id, clean);
    setSavingTitle(false);
    if (ok) {
      setKit({ ...kit, title: clean });
      setEditingTitle(false);
      toast.success("Името е обновено");
    } else {
      toast.error("Неуспешно преименуване");
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!editable) return;
    if (!confirm("Премахване на документа от комплекта?")) return;
    setRemovingId(itemId);
    const ok = await removeItemFromKit(itemId);
    setRemovingId(null);
    if (ok) {
      setKit({ ...kit, items: kit.items.filter((i) => i.id !== itemId) });
      toast.success("Документът е премахнат");
    } else {
      toast.error("Неуспешно премахване");
    }
  };


  return (
    <>
      <Seo title={`${kit.title} | Моят комплект`} description={kit.title} noindex />
      <Header />
      <main className="bg-background">
        <section className="border-b border-border/40">
          <div className="container py-10">
            <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Link to="/komplekti" className="hover:text-gold">Комплекти</Link>
              <span>/</span>
              <Link to="/account" className="hover:text-gold">Моите комплекти</Link>
              <span>/</span>
              <span className="text-foreground">{kit.title}</span>
            </nav>
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
                  {kit.status === "in_progress" ? "В процес" : kit.status === "complete" ? "Завършен" : "Архив"}
                </p>
                {editingTitle ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="h-11 max-w-md text-lg font-semibold"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setEditingTitle(false);
                      }}
                    />
                    <Button size="sm" onClick={saveRename} disabled={savingTitle} className="bg-gradient-gold text-navy">
                      {savingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Запази"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>Отказ</Button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-start gap-2">
                    <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-4xl">
                      {kit.title}
                    </h1>
                    {editable && (
                      <button
                        type="button"
                        onClick={beginRename}
                        className="mt-2 rounded-md p-1 text-muted-foreground hover:text-gold"
                        title="Преименувай"
                        aria-label="Преименувай"
                      >
                        <PenSquare className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Прогрес: {progress.done} / {progress.total} документа готови
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {editable && (
                  <Button asChild variant="outline" className="border-gold/60 text-gold hover:bg-gold/10">
                    <Link to={`/komplekti/nov?kit=${kit.id}`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Добави документ
                    </Link>
                  </Button>
                )}
                <Button
                  onClick={handleExport}
                  disabled={exporting || progress.done === 0}
                  className="bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
                  title={progress.done === 0 ? "Първо попълнете поне един документ" : "Изтегли обединено PDF"}
                >
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Експорт PDF
                </Button>
                <Button
                  onClick={() => setBulkSignOpen(true)}
                  disabled={signedLocked || kit.items.every((i) => !i.saved_id && !i.uploaded_id)}
                  variant="outline"
                  className="border-gold/60 text-gold hover:bg-gold/10"
                  title={signedLocked ? "Комплектът вече е изпратен за подпис" : "Създай заявки за подпис за всички готови документи наведнъж"}
                >
                  <PenSquare className="mr-2 h-4 w-4" />
                  {signedLocked ? "Изпратен за подпис" : "Изпрати комплекта за подпис"}
                </Button>
                {tpl && (
                  <Button asChild variant="outline">
                    <Link to={`/komplekti/${tpl.id}`}>Виж шаблона на комплекта</Link>
                  </Button>
                )}
                {kit.status !== "complete" && (
                  <Button onClick={handleComplete} variant="outline">
                    Маркирай като завършен
                  </Button>
                )}
                {kit.status !== "archived" && (
                  <Button onClick={handleArchive} variant="ghost" size="sm">
                    Архивирай
                  </Button>
                )}
              </div>
            </div>

            {/* Sign / lock hint */}
            <div className="mt-6">
              {signedLocked ? (
                <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Комплектът е изпратен за подпис</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Редактирането на съдържанието е заключено. Отворете „Подписани" в работния кът, за да следите статуса.
                    </p>
                  </div>
                </div>
              ) : isComplete ? (
                <div className="flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
                  <PenSquare className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Готов за подпис</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Отворете всеки документ от списъка и натиснете „Изпрати за подпис". Всеки запис се
                      обработва като отделен плик с електронен подпис.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
                  За електронен подпис на целия комплект, попълнете всички документи.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="container py-10">
          <div className="grid gap-8 lg:grid-cols-3">
            <ItemColumn label="Основен документ" items={grouped.primary} templatesIndex={templatesIndex} kitId={kit.id} editable={editable} onRemove={handleRemoveItem} removingId={removingId} />
            <ItemColumn label="Приложения" items={grouped.appendix} templatesIndex={templatesIndex} kitId={kit.id} editable={editable} onRemove={handleRemoveItem} removingId={removingId} />
            <ItemColumn label="Придружаващи" items={grouped.companion} templatesIndex={templatesIndex} kitId={kit.id} editable={editable} onRemove={handleRemoveItem} removingId={removingId} />
          </div>
        </section>
      </main>
      <KitBulkSigningDialog
        open={bulkSignOpen}
        onOpenChange={setBulkSignOpen}
        kitTitle={kit.title}
        items={kit.items}
        isPro={isPro}
        alreadySent={signedLocked}
        onCreated={async () => {
          const locked = await kitHasSigningRequests(kit.items);
          setSignedLocked(locked);
        }}
      />
      <SeoFooter />
    </>
  );
}

function ItemColumn({
  label,
  items,
  templatesIndex,
  kitId,
  editable,
  onRemove,
  removingId,
}: {
  label: string;
  items: UserKitItem[];
  templatesIndex: Map<string, { slug: string }>;
  kitId: string;
  editable: boolean;
  onRemove: (itemId: string) => void;
  removingId: string | null;
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
          const removing = removingId === it.id;
          const inner = (
            <>
              <div className="flex items-start gap-3">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />
                )}
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">{name}</span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {done ? "Готов" : "Очаква попълване"}
                  </p>
                </div>
              </div>
              {t && !done && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold opacity-60 group-hover:translate-x-0.5" />
              )}
            </>
          );
          return (
            <li key={it.id} className="relative">
              {t ? (
                <Link
                  to={`/shablon/${t.slug}?kit=${kitId}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3 pr-10 transition-colors hover:border-gold/40 hover:bg-card/70"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3 pr-10 opacity-70">
                  {inner}
                </div>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(it.id);
                  }}
                  disabled={removing}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  title="Премахни от комплекта"
                  aria-label="Премахни от комплекта"
                >
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {label === "Основен документ" && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Package className="h-3 w-3 text-gold/70" /> Прогресът се запазва автоматично.
        </p>
      )}
    </div>
  );
}
