import { BrowseShelf } from "@/components/home/BrowseShelf";
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
    <section id="paketi" aria-labelledby="sector-packages-heading" className="commerce-packages border-b border-border">
      <div className="container py-14 sm:py-20">
        <div className="min-w-0">
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

          <BrowseShelf label="Пакети по сектори">
            {SECTOR_PACKAGES.map((item) => {
              const availability = getDeclaredSectorPackageAvailability(item);
              const stages = [...new Set(item.documents.map((document) => document.stage.replace(/^\d+ · /, "")))];
              return (
                <li key={item.id} className="browse-item">
                  <Link to={`/paketi/${item.slug}`} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <img src={IMAGES[item.image]} alt="" loading="lazy" decoding="async" width={480} height={320} className="browse-image" />
                    <span className="block min-w-0 p-5">
                      <span className="block font-serif text-[22px] font-bold leading-tight text-foreground underline-offset-4 group-hover:underline">{item.title}</span>
                      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">{item.outcome}</span>
                      <span className="mt-3 block text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold">Етапи:</span> {stages.join(" · ")}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{availability.available} налични · {availability.planned} планирани</span>
                    <span className="mt-5 flex min-h-11 items-center justify-between border-t border-border pt-3 text-sm font-semibold text-foreground">Разгледайте пакета <ArrowRight className="size-4" /></span></span>
                  </Link>
                </li>
              );
            })}
          </BrowseShelf>
        </div>
        <LaunchPurchaseBanner className="mt-8" source="package_catalog" productId="package_catalog" />
      </div>
    </section>
  );
}
