/**
 * Самостоятелна продуктова страница — /produkti/{slug}.
 *
 * Цялото съдържание идва от `@/lib/products` (единствен източник за цени и
 * копие), затова телефон и десктоп показват едно и също основно съдържание и
 * едни и същи метаданни. Нищо не се дозарежда след клик.
 */
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SeoFooter } from "@/components/SeoFooter";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { ProductPrice } from "@/components/products/ProductPrice";
import { PlanAlternativeNote } from "@/components/products/PlanAlternativeNote";
import { ReviewerContentHub } from "@/components/analysis/ReviewerContentHub";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  PRODUCT_ACCEPTED_INPUT,
  PRODUCT_MAX_SOURCE_CHARS,
} from "@/lib/productSource";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_PRELAUNCH_MESSAGE,
  ONE_TIME_PURCHASES_AVAILABLE,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  getProductBySlug,
  legacyProductRedirect,
  productPath,
  productPriceLabel,
  type OneTimeProduct,
} from "@/lib/products";
import { PRELAUNCH_LABELS } from "@/lib/prelaunch";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";


const SITE = "https://dogovori.net";

function buildJsonLd(product: OneTimeProduct) {
  const url = `${SITE}${productPath(product)}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Продукти",
          item: `${SITE}/produkti`,
        },
        { "@type": "ListItem", position: 3, name: product.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: product.page.title,
      description: product.page.metaDescription,
      url,
      inLanguage: "bg-BG",
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: product.name,
      description: product.page.metaDescription,
      url,
      areaServed: "BG",
      provider: { "@type": "Organization", name: "Договори.нет", url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: product.page.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const product = getProductBySlug(slug);

  if (!product) {
    // Изтеглените стари адреси водят към каноничната страница, не към списъка.
    const legacy = legacyProductRedirect(slug);
    return <Navigate to={legacy ?? "/produkti"} replace />;
  }

  const related = ONE_TIME_PRODUCTS.filter((p) => p.id !== product.id);

  return (
    <>
      <Seo
        title={product.page.title}
        description={product.page.metaDescription}
        canonical={productPath(product)}
        jsonLd={buildJsonLd(product)}
      />
      <Header />
      <main className="route-fade min-h-dvh pb-20">
        <section className="container pt-6 sm:pt-10">
          <nav aria-label="Път до страницата" className="text-[12px] text-muted-foreground">
            <Link to="/" className="hover:text-gold">
              Начало
            </Link>
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
            <Link to="/produkti" className="hover:text-gold">
              Продукти
            </Link>
          </nav>

          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
            <div className="min-w-0">
              <h1 className="font-serif text-[32px] font-bold leading-[1.12] tracking-tight [text-wrap:balance] sm:text-4xl">
                {product.page.h1}
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                {product.page.intro}
              </p>

              <div className="mt-5 inline-flex flex-col gap-1 rounded-xl border border-gold/25 bg-gold/[0.07] px-3.5 py-2.5">
                <ProductPrice id={product.id} size="lg" showLabel />
                <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  еднократно · без абонамент
                </span>
              </div>

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                {ONE_TIME_PURCHASES_AVAILABLE ? (
                  <Link
                    to={product.ctaHref}
                    onClick={() =>
                      trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
                        product: product.id,
                        source: "product_detail",
                        variant: "detail",
                      })
                    }
                    className="btn-gold btn-press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-bold tracking-tight"
                  >
                    {product.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span
                    data-testid="product-prelaunch-status"
                    role="status"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-gold/35 bg-gold/[0.07] px-6 text-[15px] font-semibold text-foreground"
                  >
                    Покупките предстоят
                  </span>
                )}
                <Link
                  to="/produkti"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border/70 px-5 text-[14px] font-semibold text-foreground/85 hover:border-gold/40"
                >
                  Вижте другите продукти
                </Link>
              </div>

              {!ONE_TIME_PURCHASES_AVAILABLE && (
                <LaunchPurchaseBanner className="mt-4 max-w-xl" source="product_detail" productId={product.id} />
              )}

              <p className="mt-3 text-[11.5px] font-medium text-muted-foreground">
                {ONE_TIME_TERMS}
              </p>

              <ul
                data-testid="product-limits"
                className="mt-3 space-y-1 text-[12px] leading-snug text-muted-foreground"
              >
                <li>{PRODUCT_ACCEPTED_INPUT}</li>
                <li>
                  До {PRODUCT_MAX_SOURCE_CHARS.toLocaleString("bg-BG")} знака в
                  документа. По-дълъг документ не се приема, вместо да го
                  съкратим тихо.
                </li>
                <li>
                  Плащате за този един документ. Резултатът не е правен съвет.
                </li>
              </ul>

              <PlanAlternativeNote className="mt-5 max-w-md" />
            </div>

            <div className="min-w-0">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Как изглежда резултатът
              </p>
              <ProductResultPreview productId={product.id} size="full" />
            </div>
          </div>
        </section>

        <section className="container mt-10" aria-labelledby="product-steps">
          <h2
            id="product-steps"
            className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl"
          >
            Три стъпки
          </h2>
          <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
            {product.page.steps.map((step, i) => (
              <li
                key={step}
                className="flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-[13.5px] leading-snug"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-serif text-[12px] font-bold text-gold">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="container mt-10 grid gap-6 sm:grid-cols-2" aria-labelledby="product-scope">
          <div>
            <h2
              id="product-scope"
              className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl"
            >
              Какво давате Вие
            </h2>
            <ul className="mt-3 space-y-2">
              {product.page.youProvide.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl">
              Какво получавате
            </h2>
            <ul className="mt-3 space-y-2">
              {product.page.youReceive.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/*
          Подробният състав на резултата. Съдържанието е монтирано в DOM и на
          телефон, и на десктоп — само визуално е групирано по раздели.
        */}
        <section className="container mt-10" aria-labelledby="product-result">
          <h2
            id="product-result"
            className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl"
          >
            Какво точно съдържа резултатът
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {product.page.resultSections.map((section) => (
              <div
                key={section.heading}
                className="rounded-xl border border-border/70 bg-card/50 p-4"
              >
                <h3 className="text-[14.5px] font-semibold">{section.heading}</h3>
                <ul className="mt-2 space-y-1.5">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[13.5px] leading-snug text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>


        {product.slug === "proverka-predi-podpis" && (
          <ReviewerContentHub className="mt-14" />
        )}

        <section className="container mt-10" aria-labelledby="product-faq">
          <h2
            id="product-faq"
            className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl"
          >
            Често задавани въпроси
          </h2>
          <dl className="mt-4 space-y-4">
            {product.page.faq.map((item) => (
              <div key={item.q} className="rounded-xl border border-border/70 bg-card/50 p-4">
                <dt className="text-[14.5px] font-semibold">{item.q}</dt>
                <dd className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="container mt-10" aria-labelledby="product-related">
          <h2
            id="product-related"
            className="font-serif text-[20px] font-bold tracking-tight sm:text-2xl"
          >
            Другите два продукта
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((p) => (
              <li key={p.id}>
                <Link
                  to={productPath(p)}
                  className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3 hover:border-gold/40"
                >
                  <span className="text-[14px] font-semibold">{p.name}</span>
                  <span className="font-serif text-[15px] font-bold tabular-nums text-gold">
                    {productPriceLabel(p.id)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Работите с документи всеки месец?{" "}
            <Link to="/plans" className="font-semibold text-gold hover:underline">
              Вижте плановете
            </Link>
            .
          </p>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}
