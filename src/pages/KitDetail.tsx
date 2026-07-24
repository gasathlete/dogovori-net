import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import * as Icons from "@/icons";
import { ArrowRight, CheckCircle2, FileText, Loader2, Package, Play, Sparkles } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { breadcrumbSchema } from "@/lib/jsonLd";
import { Button } from "@/components/ui/button";
import { getKit, type KitItem } from "@/data/documentKits";
import { allTemplates } from "@/lib/templateIndex";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { createKitFromTemplate } from "@/lib/kits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function KitDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [starting, setStarting] = useState(false);

  const kit = slug ? getKit(slug) : undefined;
  if (!kit) return <Navigate to="/komplekti" replace />;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  const Icon = (Icons as any)[kit.icon] ?? Icons.Package;

  const templatesIndex = useMemo(() => {
    const m = new Map<string, { slug: string }>();
    for (const t of allTemplates()) m.set(t.doc.name, { slug: t.slug });
    return m;
  }, []);

  const grouped = useMemo(() => {
    const primary = kit.items.filter((i) => i.role === "primary");
    const appendix = kit.items.filter((i) => i.role === "appendix");
    const companion = kit.items.filter((i) => i.role === "companion");
    return { primary, appendix, companion };
  }, [kit]);

  const { isPro, isTeam } = useIsPro();
  const requireAuth = useRequireAuth();
  const handleStart = async () => {
    if (!requireAuth({ action: `Стартирай комплект „${kit.title}"`, redirect: `/komplekti/${kit.id}` })) {
      return;
    }
    if (!user) return;
    // Kits са само за платени планове — free потребителите виждат paywall.
    if (!isPro && !isTeam) {
      toast.error("Комплекти са само за платени планове", {
        description: "Активирай Предприемач за неограничени комплекти документи.",
        action: { label: "Виж Предприемач", onClick: () => navigate("/plans") },
      });
      return;
    }

    setStarting(true);
    try {
      const created = await createKitFromTemplate(user.id, kit.id);
      if (!created) {
        toast.error("Не успяхме да създадем комплекта");
        return;
      }
      toast.success("Комплектът е създаден");
      // Open the first primary doc's template
      const first = kit.items[0];
      const slug = first && templatesIndex.get(first.docName)?.slug;
      if (slug) {
        navigate(`/shablon/${slug}?kit=${created.id}`);
      } else {
        navigate(`/account?tab=kits&kit=${created.id}`);
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Seo
        title={`${kit.title} | Комплект документи`}
        description={kit.shortDescription}
        canonical={`https://dogovori.net/komplekti/${kit.id}`}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: kit.title,
            description: kit.shortDescription,
            itemListElement: kit.items.map((it, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: it.docName,
            })),
          },
          breadcrumbSchema([
            { name: "Начало", url: "/" },
            { name: "Комплекти", url: "/komplekti" },
            { name: kit.title },
          ]),
        ]}
      />
      <Header />
      <main className="bg-background">
        <section className="border-b border-border/40">
          <div className="container py-12">
            <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Link to="/komplekti" className="hover:text-gold">Комплекти</Link>
              <span>/</span>
              <span className="text-foreground">{kit.title}</span>
            </nav>
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold sm:inline-flex">
                  <Icon className="h-7 w-7" strokeWidth={1.6} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
                    {kit.groupLabel}
                    {kit.featured && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] text-gold">
                        <Sparkles className="h-2.5 w-2.5" /> ТОП
                      </span>
                    )}
                  </p>
                  <h1 className="mt-1 font-serif text-3xl font-bold leading-[1.1] text-balance md:text-4xl">
                    {kit.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base text-muted-foreground">
                    {kit.shortDescription}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground/80">
                    <span className="text-gold">За кого:</span> {kit.forWho}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Button
                  onClick={handleStart}
                  disabled={starting}
                  className="bg-gradient-gold text-navy hover:shadow-gold"
                >
                  {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Стартирай комплекта
                </Button>
                <p className="text-center text-[10px] text-muted-foreground">
                  {kit.items.length} документа • запазват се в профила
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-10">
          <div className="grid gap-8 lg:grid-cols-3">
            <KitSection label="Основен документ" items={grouped.primary} templatesIndex={templatesIndex} />
            <KitSection label="Приложения" items={grouped.appendix} templatesIndex={templatesIndex} />
            <KitSection label="Придружаващи" items={grouped.companion} templatesIndex={templatesIndex} />
          </div>

          <div className="mt-12 rounded-xl border border-gold/20 bg-gold/5 p-6">
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
              <Package className="h-5 w-5 text-gold" /> Как работи?
            </h2>
            <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-gold" />
                <span>Натискате „Стартирай комплекта" — създаваме празна папка в профила ви.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-gold" />
                <span>Преминавате през wizard на всеки документ — данните се запазват автоматично.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-gold" />
                <span>Когато комплектът е готов, изтегляте всичко като един обединен PDF.</span>
              </li>
            </ol>
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}

function KitSection({
  label, items, templatesIndex,
}: {
  label: string;
  items: KitItem[];
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
          const t = templatesIndex.get(it.docName);
          const inner = (
            <>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{it.docName}</span>
                    {it.optional && (
                      <span className="rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                        по избор
                      </span>
                    )}
                  </div>
                  {it.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{it.note}</p>}
                </div>
              </div>
              {t && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold opacity-60 group-hover:translate-x-0.5" />}
            </>
          );
          return (
            <li key={it.docName + it.role}>
              {t ? (
                <Link
                  to={`/shablon/${t.slug}`}
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
