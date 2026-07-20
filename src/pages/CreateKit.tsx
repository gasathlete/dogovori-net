import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Package, Search, Loader2, Plus, ArrowRight, Wand2, CheckCircle2, ExternalLink, X,
  FileText, Upload,
} from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTemplateSearch, type TemplateSearchHit } from "@/hooks/useTemplateSearch";
import {
  addItemToKit, createKit, getKitWithItems,
  type UserKit, type UserKitItem,
} from "@/lib/kits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExistingDoc {
  id: string;
  title: string;
  kind: "saved" | "uploaded";
  subtitle?: string;
  created_at: string;
}

/**
 * Създай нов комплект — flow:
 * 1. Потребителят въвежда име на комплекта.
 * 2. Търси шаблони и добавя избраните с бутон „Изготви документ".
 *    При първо добавяне комплектът се създава.
 * 3. Бутонът навигира към шаблона със `?kit={id}`, така че записът
 *    ще се асоциира с комплекта.
 */
export default function CreateKitPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [kit, setKit] = useState<UserKit | null>(null);
  const [items, setItems] = useState<UserKitItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const { hits, loading, total } = useTemplateSearch(q, {
    limit: 25,
    enabled: q.trim().length > 0,
  });

  // Existing documents from profile
  const [existing, setExisting] = useState<ExistingDoc[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingQ, setExistingQ] = useState("");
  const [addingExistingId, setAddingExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const [{ data: saved }, { data: uploads }] = await Promise.all([
          supabase.from("saved_documents")
            .select("id,title,kind,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("uploaded_contracts")
            .select("id,title,original_filename,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        if (cancelled) return;
        const rows: ExistingDoc[] = [
          ...(saved || []).map((r: any) => ({
            id: r.id,
            title: r.title || "Без заглавие",
            kind: "saved" as const,
            subtitle: r.kind ? String(r.kind) : undefined,
            created_at: r.created_at,
          })),
          ...(uploads || []).map((r: any) => ({
            id: r.id,
            title: r.title || r.original_filename || "Качен документ",
            kind: "uploaded" as const,
            subtitle: r.original_filename,
            created_at: r.created_at,
          })),
        ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setExisting(rows);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const filteredExisting = useMemo(() => {
    const needle = existingQ.trim().toLowerCase();
    if (!needle) return existing;
    return existing.filter((d) => d.title.toLowerCase().includes(needle));
  }, [existing, existingQ]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);

  if (!authLoading && !user) {
    return <Navigate to="/auth?next=/komplekti/nov" replace />;
  }

  const ensureKit = async (): Promise<UserKit | null> => {
    if (kit) return kit;
    const name = title.trim() || "Нов комплект";
    setCreating(true);
    try {
      const created = await createKit({ user_id: user!.id, title: name });
      if (!created) {
        toast.error("Не успяхме да създадем комплекта");
        return null;
      }
      setKit(created);
      setTitle(created.title);
      return created;
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async (hit: TemplateSearchHit) => {
    setAddingSlug(hit.slug);
    try {
      const k = await ensureKit();
      if (!k) return;
      const already = items.some((it) => it.planned_doc_name === hit.name);
      if (!already) {
        const role: UserKitItem["role"] = items.length === 0 ? "primary" : "companion";
        const added = await addItemToKit({
          kit_id: k.id,
          role,
          ref_label: hit.name,
          planned_doc_name: hit.name,
        });
        if (added) setItems((prev) => [...prev, added]);
      }
      toast.success(`Добавен в комплекта: ${hit.name}`);
      navigate(`/shablon/${hit.slug}?kit=${k.id}`);
    } finally {
      setAddingSlug(null);
    }
  };

  const handleAddExisting = async (doc: ExistingDoc) => {
    setAddingExistingId(doc.id);
    try {
      const k = await ensureKit();
      if (!k) return;
      const dup = items.some(
        (it) => (doc.kind === "saved" ? it.saved_id : it.uploaded_id) === doc.id,
      );
      if (dup) {
        toast.info("Този документ вече е в комплекта");
        return;
      }
      const role: UserKitItem["role"] = items.length === 0 ? "primary" : "companion";
      const added = await addItemToKit({
        kit_id: k.id,
        role,
        ref_label: doc.title,
        saved_id: doc.kind === "saved" ? doc.id : undefined,
        uploaded_id: doc.kind === "uploaded" ? doc.id : undefined,
        planned_doc_name: doc.title,
      });
      if (added) {
        setItems((prev) => [...prev, added]);
        toast.success(`Добавен в комплекта: ${doc.title}`);
      } else {
        toast.error("Не успяхме да добавим документа");
      }
    } finally {
      setAddingExistingId(null);
    }
  };

  const refreshItems = async () => {
    if (!kit) return;
    const full = await getKitWithItems(kit.id);
    if (full) setItems(full.items);
  };
  // Re-sync when window regains focus (e.g. after finishing a wizard in a new tab)
  useEffect(() => {
    const onFocus = () => { void refreshItems(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.id]);

  const canSearch = q.trim().length > 0;

  return (
    <>
      <Seo title="Създай комплект | dogovori.net" description="Съберете свои документи в комплект — търсете шаблони и добавяйте с един клик." noindex />
      <Header />
      <main className="bg-background">
        <section className="border-b border-border/40">
          <div className="container py-8 md:py-10">
            <nav className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Link to="/komplekti" className="hover:text-gold">Комплекти</Link>
              <span>/</span>
              <span className="text-foreground">Нов</span>
            </nav>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-gold" />
                  <h1 className="font-serif text-2xl font-bold sm:text-3xl">Създай свой комплект</h1>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Задайте име и добавете документи чрез търсачката. Бутонът „Изготви документ"
                  създава комплекта (ако още не е) и отваря съветника за избрания шаблон.
                </p>
              </div>
              {kit && (
                <Button asChild variant="outline" size="sm" className="shrink-0 border-gold/60 text-gold hover:bg-gold/10">
                  <Link to={`/komplekti/moi/${kit.id}`}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Виж комплекта
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="container py-6 md:py-8">
          <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
            {/* Left: title + search + results */}
            <div className="min-w-0 space-y-5">
              <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
                  Име на комплекта
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="напр. Сделка с офис №14"
                  className="mt-2 h-11"
                  disabled={!!kit}
                />
                {kit && (
                  <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Комплектът е създаден
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
                  Търси шаблон
                </label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder='напр. „наем офис", „NDA", „трудов договор"…'
                    className="h-11 pl-9 pr-9"
                    autoFocus
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Изчисти търсенето"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {canSearch && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {loading ? "Търсене…" : `${total} резултата`}
                  </p>
                )}
              </div>

              {/* Results */}
              {!canSearch ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    Започнете да пишете, за да намерите шаблони от каталога.
                  </p>
                </div>
              ) : loading && hits.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : hits.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
                  <p className="text-sm text-muted-foreground">Няма намерени шаблони.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/30">
                  {hits.map((hit) => {
                    const added = items.some((it) => it.planned_doc_name === hit.name);
                    const busy = addingSlug === hit.slug || creating;
                    return (
                      <li key={hit.slug} className="p-4 transition-colors hover:bg-muted/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gold/80">
                              {hit.category_title}
                            </div>
                            <h3 className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground">
                              {hit.name}
                            </h3>
                            {hit.purpose && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {hit.purpose}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-gold">
                              <Link to={`/shablon/${hit.slug}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Преглед
                              </Link>
                            </Button>
                            <Button
                              onClick={() => handleGenerate(hit)}
                              disabled={busy}
                              size="sm"
                              className="bg-gradient-gold text-navy hover:shadow-gold disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : added ? (
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              ) : (
                                <Wand2 className="mr-1 h-3.5 w-3.5" />
                              )}
                              {added ? "Изготви отново" : "Изготви документ"}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Right: kit summary */}
            <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
                    В комплекта
                  </h2>
                  <span className="text-[11px] text-muted-foreground">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Все още няма добавени документи. Използвайте „Изготви документ", за да
                    добавите първия.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-start gap-2 rounded-md bg-background/40 px-2.5 py-2">
                        <Plus className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
                        <span className="line-clamp-2 text-xs text-foreground">
                          {it.planned_doc_name || it.ref_label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {kit && (
                  <Button asChild size="sm" className="mt-4 w-full bg-gradient-gold text-navy hover:shadow-gold">
                    <Link to={`/komplekti/moi/${kit.id}`}>
                      Виж комплекта <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
              <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                Съвет: първият добавен документ става „основен" в комплекта. Останалите се
                записват като „придружаващи" — можете да ги пренареждате от страницата на
                комплекта.
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}
