// Centralized JSON-LD schema builders for SEO.
// Use these instead of hand-rolling objects in each page — guarantees
// consistent @context, URL shape, and required fields across the app.

const SITE = "https://dogovori.net";

const abs = (path: string) =>
  path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? path : `/${path}`}`;

export interface BreadcrumbItem {
  name: string;
  /** Path (with leading "/") or absolute URL. Omit for the final/current item. */
  url?: string;
}

/**
 * BreadcrumbList — improves Google's site-link rendering and SERP CTR.
 * Pass the chain top-down, e.g. [{name:"Home", url:"/"}, {name:"Blog", url:"/blog"}, {name:"Post title"}].
 */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: abs(it.url) } : {}),
    })),
  };
}

export interface FaqQA {
  question: string;
  answer: string;
}

/** FAQPage — eligible for FAQ rich result on supported queries. */
export function faqSchema(qa: FaqQA[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.question,
      acceptedAnswer: { "@type": "Answer", text: x.answer },
    })),
  };
}

export interface ArticleSchemaInput {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  publisherLogo?: string;
}

export function articleSchema(a: ArticleSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(a.url) },
    ...(a.image ? { image: abs(a.image) } : {}),
    ...(a.datePublished ? { datePublished: a.datePublished } : {}),
    ...(a.dateModified ? { dateModified: a.dateModified } : {}),
    author: { "@type": a.authorName ? "Person" : "Organization", name: a.authorName ?? "Dogovori.net" },
    publisher: {
      "@type": "Organization",
      name: a.publisherName ?? "Dogovori.net",
      logo: { "@type": "ImageObject", url: abs(a.publisherLogo ?? "/favicon.png") },
    },
  };
}

/** ItemList — generic list rendering for collection pages (catalog, hubs). */
export function itemListSchema(name: string, urls: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: urls.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: u.name,
      url: abs(u.url),
    })),
  };
}

/**
 * SoftwareApplication — Dogovori.net is a web app with structured pricing.
 * Add to home/landing for richer entity signals.
 */
export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dogovori.net",
    url: SITE,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "bg-BG",
    description:
      "AI асистент за генериране, проверка и електронно подписване на български правни документи и договори.",
    offers: [
      {
        "@type": "Offer",
        name: "Pro",
        price: "9.90",
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "9.90",
          priceCurrency: "EUR",
          referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
        },
      },
      {
        "@type": "Offer",
        name: "Team (per seat)",
        price: "7.90",
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "7.90",
          priceCurrency: "EUR",
          referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
        },
      },
      {
        "@type": "Offer",
        name: "Pay-as-you-go pack (5 ops)",
        price: "1.90",
        priceCurrency: "EUR",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
    },
  };
}

/**
 * LegalService — entity hint that the site offers legal document services
 * (templates, review, signing) in Bulgaria. Helps local/legal SERP intent.
 */
export function legalServiceSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: "Dogovori.net",
    url: SITE,
    areaServed: { "@type": "Country", name: "Bulgaria" },
    availableLanguage: ["Bulgarian", "English"],
    serviceType: [
      "Legal document templates",
      "Contract generation",
      "Contract review",
      "Electronic signatures",
    ],
    priceRange: "€",
  };
}

export { SITE as SITE_URL };
