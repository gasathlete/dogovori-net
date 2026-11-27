import { ArrowRight } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { PackagePurchaseNote } from "@/components/prelaunch/LaunchPurchaseBanner";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { getSectorPackageAvailability, SECTOR_PACKAGES } from "@/data/sectorPackages";
import { allTemplates } from "@/lib/templateIndex";

const CANONICAL_TEMPLATE_NAMES = new Set(allTemplates().map((entry) => entry.doc.name));

export default function SectorPackagesPage() {
  return (
    <>
      <Seo title="Пакети документи по бизнес сектор | Dogovori.net" description="Разгледайте подредени пакети документи за наеми, услуги, дигитални агенции и работодатели — от началната договорка до приключването." canonical="/paketi" />
      <Header />
      <main className="public-packages route-fade min-h-dvh">
        <section className="border-b border-border/50 bg-card/20">
          <div className="container py-12 sm:py-16">
            <h1 className="max-w-3xl font-serif text-3xl font-bold leading-tight sm:text-5xl">Работният цикъл, подреден в документи</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">Всеки пакет следва повтарящ процес в един бизнес сектор. Можете да разгледате наличните документи и ясно отбелязаните планирани позиции.</p>
            <PackagePurchaseNote className="mt-7 max-w-4xl" source="package_catalog" productId="package_catalog" />
          </div>
        </section>
        <section className="container py-10 sm:py-14">
          <div className="grid gap-x-12 md:grid-cols-2">
            {SECTOR_PACKAGES.map((item) => {
              const availability = getSectorPackageAvailability(item, CANONICAL_TEMPLATE_NAMES);
              return (
                <article key={item.id} className="flex h-full flex-col border-t border-border py-7 sm:py-9">
                  <h2 className="font-serif text-2xl font-bold">{item.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{availability.available} налични · {availability.planned} планирани</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.audience}</p>
                  <ol className="mt-5 space-y-2 border-l border-gold/25 pl-4">
                    {[...new Set(item.documents.map((document) => document.stage))].map((stage) => <li key={stage} className="text-sm font-medium text-foreground/80">{stage}</li>)}
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