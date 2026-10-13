import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import * as Icons from "@/icons";
import { ArrowRight, FileText, Package, Sparkles } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { breadcrumbSchema } from "@/lib/jsonLd";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { getKit, type KitItem } from "@/data/documentKits";
import { getKitSections, type KitLifecycleStage } from "@/data/featuredKitStages";
import { RelatedSectorPackages } from "@/components/RelatedSectorPackages";
import { getSectorPackagesForKit } from "@/lib/seoCollections";
import { allTemplates } from "@/lib/templateIndex";
import { taskForKit } from "@/data/everydayTasks";
import { KIT_GUIDES } from "@/lib/catalogMatrix";

export default function KitDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const kit = slug ? getKit(slug) : undefined;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  const templatesIndex = useMemo(() => {
    const m = new Map<string, { slug: string }>();
    for (const t of allTemplates()) m.set(t.doc.name, { slug: t.slug });
    return m;
  }, []);

  const sections = useMemo(() => kit ? getKitSections(kit) : [], [kit]);
  const task = kit ? taskForKit(kit.id) : undefined;
  if (!kit) return <Navigate to="/komplekti" replace />;
  const Icon = (Icons as unknown as Record<string, typeof Icons.Package>)[kit.icon] ?? Icons.Package;

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
            </div>
            {task?.preparationPath && (
              <div className="mt-7 flex flex-col gap-3 rounded-xl border border-gold/40 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">Какво искате да направите?</p>
                  <p className="mt-1 font-serif text-lg font-bold">{task.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Отговорете на няколко въпроса и вижте кои документи са приложими.</p>
                </div>
                <Link to={task.preparationPath} className="btn-gold inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold">
                  Започнете подготовката <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
            <LaunchPurchaseBanner className="mt-7" source="kit_detail" productId={`kit_${kit.id.replace(/-/g, "_")}`} />
          </div>
        </section>

        <section className="container py-10">
          <h2 className="font-serif text-2xl font-bold">Документите в реда на ситуацията</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Разгледайте всеки наличен документ. Конкретният случай може да изисква различен обхват или допълнителен правен преглед.</p>
          <div className="mt-7 grid gap-8 lg:grid-cols-3">
            {sections.map(({ stage, items }, index) => (
              <KitSection key={stage.id} label={`${String(index + 1).padStart(2, "0")} · ${stage.label}`} items={items} plannedItem={stage.plannedItem} templatesIndex={templatesIndex} />
            ))}
          </div>

          {KIT_GUIDES[kit.id] && (
            <dl className="mt-10 grid gap-4 rounded-xl border border-border/60 bg-card/60 p-6 sm:grid-cols-2">
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">Какво ми трябва?</dt><dd className="mt-1 text-sm text-muted-foreground">{KIT_GUIDES[kit.id].whatYouNeed}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">Какво следва?</dt><dd className="mt-1 text-sm text-muted-foreground">{KIT_GUIDES[kit.id].nextStep}</dd></div>
            </dl>
          )}

          <RelatedSectorPackages packages={getSectorPackagesForKit(kit.id)} />

          <div className="mt-12 rounded-xl border border-gold/20 bg-gold/5 p-6">
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
              <Package className="h-5 w-5 text-gold" /> Какво е налично сега
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Страниците на документите и примерите са достъпни за преглед. Стартирането на нов комплект и покупката остават затворени до пускането. Създадените по-рано комплекти остават в профила Ви.</p>
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}

function KitSection({
  label, items, plannedItem, templatesIndex,
}: {
  label: string;
  items: KitItem[];
  plannedItem?: KitLifecycleStage["plannedItem"];
  templatesIndex: Map<string, { slug: string }>;
}) {
  if (items.length === 0 && !plannedItem) return null;
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
        {plannedItem && (
          <li>
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-card/25 px-3 py-3">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />
              <div>
                <p className="text-sm font-medium text-foreground">{plannedItem}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Планирано</p>
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}

