import { ArrowRight } from "@/icons";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { getDeclaredSectorPackageAvailability, SECTOR_PACKAGES } from "@/data/sectorPackages";
import rentImage from "@/assets/kits/kit-real-estate.jpg";
import servicesImage from "@/assets/scenarios/sc-freelance.jpg";
import digitalImage from "@/assets/kits/kit-digital.jpg";
import employmentImage from "@/assets/kits/kit-employment.jpg";

const IMAGES = { rentals: rentImage, services: servicesImage, digital: digitalImage, employment: employmentImage } as const;
// Началната страница не зарежда каталожния chunk (~43 KB gzip): броим декларираните
// позиции, а тестът sectorPackageAvailability гарантира, че всяко име
// съществува в каноничния каталог, така че броят не може тихо да се размине.

export function SectorPackages() {
  return (
    <section id="paketi" aria-labelledby="sector-packages-heading" className="border-b border-border">
      <div className="container py-14 sm:py-20">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 id="sector-packages-heading" className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
              Пакети по сектори
            </h2>
            <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              Документите за целия работен цикъл, подредени по етапи. Съдържанието и примерите остават видими.
            </p>
            <Link to="/paketi" className="link-ink mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              Всички пакети <ArrowRight className="size-4" />
            </Link>
          </div>

          <ul className="border-t border-foreground/80">
            {SECTOR_PACKAGES.map((item) => {
              const availability = getDeclaredSectorPackageAvailability(item);
              const stages = [...new Set(item.documents.map((document) => document.stage.replace(/^\d+ · /, "")))];
              return (
                <li key={item.id} className="border-b border-border">
                  <Link to={`/paketi/${item.slug}`} className="group grid gap-4 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[88px_minmax(0,1fr)]">
                    <img src={IMAGES[item.image]} alt="" loading="lazy" decoding="async" width={88} height={88} className="hidden size-[88px] rounded-sm object-cover sm:block" />
                    <span className="min-w-0">
                      <span className="block font-serif text-[22px] font-bold leading-tight text-foreground underline-offset-4 group-hover:underline">{item.title}</span>
                      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">{item.outcome}</span>
                      <span className="mt-3 block text-sm text-foreground/80">
                        <span className="font-semibold">Етапи:</span> {stages.join(" · ")}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{availability.available} налични · {availability.planned} планирани</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <LaunchPurchaseBanner className="mt-8" source="package_catalog" productId="package_catalog" />
      </div>
    </section>
  );
}
