/**
 * /produkti — каноничната публична витрина на трите еднократни продукта.
 */
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { ProductShowcaseCarousel } from "@/components/products/ProductShowcaseCarousel";
import { ProductComparisonList } from "@/components/products/ProductComparisonList";
import { StepsStrip } from "@/components/products/StepsStrip";
import { FrequencyCompare } from "@/components/products/FrequencyCompare";
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
              Три резултата за един документ
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Проверка преди подпис, поправка на текста или пълен пакет за
              преговори — плащате веднъж, без абонамент.
            </p>
            <p className="mt-4 inline-flex items-baseline gap-2 rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-1.5">
              <span className="font-serif text-[22px] font-bold tabular-nums text-gold">
                от {lowestOneTimePriceLabel()}
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                еднократно
              </span>
            </p>
          </div>
        </section>

        {/* Витрината е високо на страницата — резултатът обяснява продукта. */}
        <section className="container mt-6" aria-label="Примерни резултати">
          <div className="mx-auto max-w-5xl">
            <ProductShowcaseCarousel source="produkti" />
          </div>
        </section>

        {/* Трите записа са четими и индексируеми без взаимодействие. */}
        <section className="container mt-10" aria-labelledby="produkti-spisak">
          <h2
            id="produkti-spisak"
            className="mb-4 text-center font-serif text-[22px] font-bold tracking-tight sm:text-2xl"
          >
            Трите продукта
          </h2>
          <ProductComparisonList />
          <div className="mx-auto mt-5 max-w-4xl">
            <StepsStrip />
            <p className="mt-4 text-center text-[12px] font-medium text-muted-foreground">
              {ONE_TIME_TERMS}
            </p>
          </div>
        </section>

        {/* Продукти и планове един до друг — тихо, само с факти. */}
        <section className="container mt-10">
          <FrequencyCompare />
        </section>
      </main>
      <SeoFooter />
    </>
  );
}
