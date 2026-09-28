import * as Icons from "@/icons";
import { ArrowRight, FileText } from "@/icons";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { SECTOR_PACKAGES } from "@/data/sectorPackages";
import rentImage from "@/assets/kits/kit-real-estate.jpg";
import servicesImage from "@/assets/scenarios/sc-freelance.jpg";
import digitalImage from "@/assets/kits/kit-digital.jpg";
import employmentImage from "@/assets/kits/kit-employment.jpg";

const IMAGES = { rentals: rentImage, services: servicesImage, digital: digitalImage, employment: employmentImage } as const;

export function SectorPackages() {
  return (
    <section id="paketi" aria-labelledby="sector-packages-heading" className="border-b border-border/40 bg-card/20">
      <div className="container py-12 sm:py-16 md:py-20">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3"><span className="h-px w-8 bg-gold/40" />Пакети по сектор</div>
          <h2 id="sector-packages-heading" className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            Документите за целия работен цикъл
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Подредени по етапи за повтарящата се работа във Вашия сектор. Съдържанието и примерите остават видими.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SECTOR_PACKAGES.map((item) => {
            const Icon = Icons[item.icon];
            const browseable = item.documents.filter((document) => document.status === "browseable").length;
            return (
              <article key={item.id} className="group overflow-hidden rounded-xl border border-gold/25 bg-card/65 shadow-soft transition-colors hover:border-gold/50">
                <div className="grid h-full sm:grid-cols-[170px_1fr]">
                  <div className="relative min-h-40 overflow-hidden border-b border-border/50 sm:border-b-0 sm:border-r">
                    <img src={IMAGES[item.image]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
                    <span className="absolute bottom-3 left-3 inline-flex size-10 items-center justify-center rounded-lg border border-gold/35 bg-background/85 text-gold"><Icon className="size-5" /></span>
                  </div>
                  <div className="flex min-w-0 flex-col p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/80">{browseable} налични документа · пълен цикъл</p>
                    <h3 className="mt-2 font-serif text-xl font-bold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.outcome}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Етапи">
                      {[...new Set(item.documents.map((document) => document.stage.replace(/^\d+ · /, "")))].map((stage) => (
                        <span key={stage} className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground"><FileText className="size-3 text-gold" />{stage}</span>
                      ))}
                    </div>
                    <Link to={`/paketi/${item.slug}`} className="mt-5 inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-gold hover:text-gold-light">
                      Разгледайте пакета <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <LaunchPurchaseBanner className="mt-6" source="package_catalog" productId="package_catalog" />
        <div className="mt-5 text-center"><Link to="/paketi" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold">Всички пакети <ArrowRight className="size-4" /></Link></div>
      </div>
    </section>
  );
}

export default SectorPackages;