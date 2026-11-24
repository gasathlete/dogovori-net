import { getPackageGuides } from "@/lib/seoCollections";
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import * as Icons from "@/icons";
import { ArrowRight, CheckCircle2, Clock, FileText } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { getSectorPackage } from "@/data/sectorPackages";
import { allTemplates } from "@/lib/templateIndex";

export default function SectorPackageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const item = getSectorPackage(slug);
  const templateByName = useMemo(() => new Map(allTemplates().map((entry) => [entry.doc.name, entry])), []);
  if (!item) return <Navigate to="/paketi" replace />;
  const guides = getPackageGuides(item.id);
  const Icon = Icons[item.icon];
  const stages = [...new Set(item.documents.map((document) => document.stage))];

  return (
    <>
      <Seo title={`${item.title} — пакет документи по сектор | Dogovori.net`} description={item.seoDescription ?? `${item.audience} ${item.outcome}`} canonical={`/paketi/${item.slug}`} />
      <Header />
      <main className="editorial-detail route-fade min-h-dvh">
        <section className="border-b border-border">
          <div className="container py-10 sm:py-14">
            <nav className="text-xs text-muted-foreground"><Link to="/paketi" className="hover:text-gold">Пакети</Link><span className="px-2">/</span>{item.title}</nav>
            <div className="mt-6 flex max-w-4xl items-start gap-4">
              <span className="hidden shrink-0 pt-1 text-muted-foreground sm:inline-flex"><Icon className="size-6" /></span>
              <div><h1 className="font-serif text-3xl font-bold leading-tight sm:text-5xl">{item.title}</h1><p className="mt-3 text-base text-muted-foreground">{item.audience}</p><p className="mt-2 max-w-2xl text-base leading-relaxed text-foreground/85">{item.outcome}</p></div>
            </div>
          </div>
        </section>
        <section className="container py-10 sm:py-14">
          <h2 className="font-serif text-2xl font-bold">Цикълът стъпка по стъпка</h2>
          <div className="mt-6 space-y-8">
            {stages.map((stage, stageIndex) => {
              const stageId = `package-${item.slug}-stage-${stageIndex + 1}`;
              return (
              <section key={stage} aria-labelledby={stageId} className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div><h3 id={stageId} className="font-serif text-xl font-semibold text-foreground">{stage}</h3></div>
                <ul className="divide-y divide-border">
                  {item.documents.filter((document) => document.stage === stage).map((document) => {
                    const template = document.docName ? templateByName.get(document.docName) : undefined;
                    const content = <><span className="flex size-9 shrink-0 items-center justify-center">{template ? <FileText className="size-4 text-gold" /> : <Clock className="size-4 text-muted-foreground" />}</span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{document.title}</span>{document.docName && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{document.docName}</span>}{document.note && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{document.note}</span>}<span className="mt-2 inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground">{template ? "Преглед на документа" : "Планирано"}{template && <ArrowRight className="size-3" />}</span></span></>;
                    return <li key={`${stage}-${document.title}`}>{template ? <Link to={`/shablon/${template.slug}`} className="flex h-full gap-3 py-5 hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{content}</Link> : <div className="flex h-full gap-3 py-5">{content}</div>}</li>;
                  })}
                </ul>
              </section>
              );
            })}
          </div>
          {guides.length > 0 && <section className="mt-10" aria-label="Практически ръководства">
            <h2 className="font-serif text-xl font-bold">Практически ръководства</h2>
            <ul className="mt-3 space-y-2">{guides.map((post) => <li key={post.slug}><Link to={`/blog/${post.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-gold underline-offset-4 hover:underline">{post.title}</Link></li>)}</ul>
          </section>}
          <div className="mt-12 grid gap-8 border-t border-border py-8 sm:grid-cols-2">
            <div><h2 className="flex items-center gap-2 font-serif text-xl font-bold"><CheckCircle2 className="size-5 text-success" />Какво можете да разгледате</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Всеки публикуван документ води към съществуващата му страница с описание и пример. Това не е покупка и не създава нов документ.</p></div>
            <div><h2 className="font-serif text-xl font-bold">Свързан комплект</h2><p className="mt-2 text-sm text-muted-foreground">За конкретна ситуация вижте подбрания комплект и неговите документи.</p><Link to={`/komplekti/${item.relatedKitId}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold">Разгледайте комплекта <ArrowRight className="size-4" /></Link></div>
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}
