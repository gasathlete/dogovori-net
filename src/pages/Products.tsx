/**
 * /produkti — каноничната публична витрина на трите еднократни продукта.
 */
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { ProductCards } from "@/components/products/ProductCards";
import { StepsStrip } from "@/components/products/StepsStrip";
import { PlanAlternativeNote } from "@/components/products/PlanAlternativeNote";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  lowestOneTimePriceLabel,
  productPath,
} from "@/lib/products";

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
      url: `https://dogovori.net${productPath(p)}`,
    })),
  },
];

export default function Products() {
  return (
    <>
      <Seo
        title="Продукти — проверка на договор, поправка и подготовка за преговори"
        description="Три еднократни продукта за един документ: подробна проверка преди подпис, конкретна поправка на текста и пълен пакет за преговори. Плащате веднъж, без абонамент."
        canonical="/produkti"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="route-fade min-h-dvh pb-16">
        <section className="container pt-7 sm:pt-12">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Продукти
            </p>
            <h1 className="mt-2 font-serif text-[32px] font-bold leading-[1.1] tracking-tight sm:text-4xl">
              Разгледайте нашите продукти
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Проверка преди подпис, конкретна поправка на текста или пълен пакет
              за преговори — за един документ, на един екран.
            </p>
            <p className="mt-4 inline-flex items-baseline gap-2 rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-1.5">
              <span className="font-serif text-[22px] font-bold tabular-nums text-gold">
                от {lowestOneTimePriceLabel()}
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                еднократно
              </span>
            </p>
            <div className="mt-5">
              <StepsStrip />
            </div>
            <p className="mt-4 text-[12px] font-medium text-muted-foreground">
              {ONE_TIME_TERMS}
            </p>
            <PlanAlternativeNote className="mx-auto mt-5 max-w-md" />
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
