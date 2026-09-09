/**
 * /produkti — каноничната публична витрина на трите еднократни продукта.
 */
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { ProductCards } from "@/components/products/ProductCards";
import { ONE_TIME_PRODUCTS, ONE_TIME_TERMS } from "@/lib/products";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Начало",
        item: "https://dogovori.net/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Продукти",
        item: "https://dogovori.net/produkti",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Продукти на Договори.нет",
    itemListElement: ONE_TIME_PRODUCTS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `https://dogovori.net/produkti#product-${p.id}`,
    })),
  },
];

export default function Products() {
  return (
    <>
      <Seo
        title="Продукти — проверка, подобряване и договорна карта"
        description="Три еднократни продукта за договорите ви: проверка преди подпис, конкретни поправки и бизнес договорна карта. Плащате веднъж, без абонамент."
        canonical="/produkti"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="route-fade min-h-dvh pb-16">
        <section className="container pt-8 sm:pt-12">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Продукти
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">
              Разгледайте нашите продукти
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Избирате резултата, който ви трябва днес — за един договор или за
              цялата договорна организация на бизнеса ви.
            </p>
            <p className="mt-3 text-[12px] font-medium text-muted-foreground">
              {ONE_TIME_TERMS}
            </p>
          </div>
        </section>

        <section className="container mt-8">
          <ProductCards variant="full" source="produkti" />
        </section>
      </main>
      <SeoFooter />
    </>
  );
}
