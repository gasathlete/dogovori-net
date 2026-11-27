import { Link } from "react-router-dom";
import type { SectorPackage } from "@/data/sectorPackages";

export function RelatedSectorPackages({ packages }: { packages: readonly SectorPackage[] }) {
  if (!packages.length) return null;
  return (
    <section className="mt-10 rounded-xl border border-gold/20 bg-gold/[0.04] p-5 sm:p-6" aria-label="Свързани пакети документи">
      <h2 className="font-serif text-xl font-bold">Документите за следващите стъпки</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Разгледайте свързаните документи, подредени по етапи. Във всеки пакет са обозначени наличните и планираните позиции.</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {packages.map((item) => (
          <li key={item.id}>
            <Link to={`/paketi/${item.slug}`} className="inline-flex min-h-11 items-center font-semibold text-gold underline-offset-4 hover:underline">{item.title}</Link>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.outcome}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
