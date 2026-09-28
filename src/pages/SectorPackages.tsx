import * as Icons from "@/icons";
import { ArrowRight } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { SECTOR_PACKAGES } from "@/data/sectorPackages";

export default function SectorPackagesPage() {
  return (
    <>
      <Seo title="Пакети документи по бизнес сектор | Dogovori.net" description="Разгледайте подредени пакети документи за наеми, услуги, дигитални агенции и работодатели — от началната договорка до приключването." canonical="/paketi" />
      <Header />
      <main className="route-fade min-h-dvh">
        <section className="border-b border-border/50 bg-card/20">
          <div className="container py-12 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Пакети по сектор</p>
            <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight sm:text-5xl">Работният цикъл, подреден в документи</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">Всеки пакет следва повтарящ процес в един бизнес сектор. Можете да разгледате наличните документи и ясно отбелязаните планирани позиции.</p>
            <LaunchPurchaseBanner className="mt-7 max-w-4xl" source="package_catalog" productId="package_catalog" />
          </div>
        </section>
        <section className="container py-10 sm:py-14">
          <div className="grid gap-4 md:grid-cols-2">
            {SECTOR_PACKAGES.map((item) => {
              const Icon = Icons[item.icon];
              return (
                <article key={item.id} className="flex h-full flex-col rounded-xl border border-border/70 bg-card/55 p-5 shadow-soft sm:p-6">
                  <span className="inline-flex size-11 items-center justify-center rounded-lg border border-gold/30 bg-gold/[0.08] text-gold"><Icon className="size-5" /></span>
                  <h2 className="mt-4 font-serif text-2xl font-bold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.audience}</p>
                  <ol className="mt-5 space-y-2 border-l border-gold/25 pl-4">
                    {[...new Set(item.documents.map((document) => document.stage))].map((stage) => <li key={stage} className="text-xs font-medium text-foreground/80">{stage}</li>)}
                  </ol>
                  <Link to={`/paketi/${item.slug}`} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-gold">Разгледайте съдържанието <ArrowRight className="size-4" /></Link>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}