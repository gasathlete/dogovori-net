import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import * as Icons from "@/icons";
import { ArrowRight, CheckCircle2, Clock, FileText } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { getSectorPackage } from "@/data/sectorPackages";
import { allTemplates } from "@/lib/templateIndex";

export default function SectorPackageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const item = getSectorPackage(slug);
  const templateByName = useMemo(() => new Map(allTemplates().map((entry) => [entry.doc.name, entry])), []);
  if (!item) return <Navigate to="/paketi" replace />;
  const Icon = Icons[item.icon];
  const stages = [...new Set(item.documents.map((document) => document.stage))];

  return (
    <>
      <Seo title={`${item.title} — пакет документи по сектор | Dogovori.net`} description={`${item.audience} ${item.outcome}`} canonical={`/paketi/${item.slug}`} />
      <Header />
      <main className="route-fade min-h-dvh">
        <section className="border-b border-border/50 bg-card/20">
          <div className="container py-10 sm:py-14">
            <nav className="text-xs text-muted-foreground"><Link to="/paketi" className="hover:text-gold">Пакети</Link><span className="px-2">/</span>{item.title}</nav>
            <div className="mt-6 flex max-w-4xl items-start gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/[0.08] text-gold"><Icon className="size-6" /></span>
              <div><h1 className="font-serif text-3xl font-bold leading-tight sm:text-5xl">{item.title}</h1><p className="mt-3 text-base text-muted-foreground">{item.audience}</p><p className="mt-2 max-w-2xl text-base leading-relaxed text-foreground/85">{item.outcome}</p></div>
            </div>
            <LaunchPurchaseBanner className="mt-7 max-w-4xl" source="package_detail" productId={item.id} />
          </div>
        </section>
        <section className="container py-10 sm:py-14">
          <h2 className="font-serif text-2xl font-bold">Цикълът стъпка по стъпка</h2>
          <div className="mt-6 space-y-8">
            {stages.map((stage, stageIndex) => {
              const stageId = `package-${item.slug}-stage-${stageIndex + 1}`;
              return (
              <section key={stage} aria-labelledby={stageId} className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div><h3 id={stageId} className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{stage}</h3></div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {item.documents.filter((document) => document.stage === stage).map((document) => {
                    const template = document.docName ? templateByName.get(document.docName) : undefined;
                    const content = <><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50">{template ? <FileText className="size-4 text-gold" /> : <Clock className="size-4 text-muted-foreground" />}</span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{document.title}</span>{document.docName && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{document.docName}</span>}{document.note && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{document.note}</span>}<span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">{template ? "Преглед на документа" : "Планирано"}{template && <ArrowRight className="size-3" />}</span></span></>;
                    return <li key={`${stage}-${document.title}`}>{template ? <Link to={`/shablon/${template.slug}`} className="flex h-full gap-3 rounded-lg border border-border/70 bg-card/50 p-4 transition-colors hover:border-gold/40">{content}</Link> : <div className="flex h-full gap-3 rounded-lg border border-dashed border-border/70 bg-card/25 p-4">{content}</div>}</li>;
                  })}
                </ul>
              </section>
              );
            })}
          </div>
          <div className="mt-10 grid gap-4 rounded-xl border border-gold/20 bg-gold/[0.04] p-5 sm:grid-cols-2 sm:p-6">
            <div><h2 className="flex items-center gap-2 font-serif text-xl font-bold"><CheckCircle2 className="size-5 text-gold" />Какво можете да разгледате</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Всеки публикуван документ води към съществуващата му страница с описание и пример. Това не е покупка и не създава нов документ.</p></div>
            <div><h2 className="font-serif text-xl font-bold">Свързан комплект</h2><p className="mt-2 text-sm text-muted-foreground">За конкретна ситуация вижте подбрания комплект и неговите документи.</p><Link to={`/komplekti/${item.relatedKitId}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold">Разгледайте комплекта <ArrowRight className="size-4" /></Link></div>
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}