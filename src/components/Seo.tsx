import { Helmet } from "react-helmet-async";

interface SeoProps {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const SITE = "https://dogovori.net";
const DEFAULT_IMAGE = `${SITE}/og-image.jpg?v=20260915b`;

export function Seo({
  title,
  description,
  canonical,
  noindex = false,
  image = DEFAULT_IMAGE,
  type = "website",
  jsonLd,
}: SeoProps) {
  const url = canonical
    ? canonical.startsWith("http")
      ? canonical
      : `${SITE}${canonical}`
    : SITE;
  // hreflang: derive BG (canonical/no prefix) and EN (/en prefix) URLs from the canonical path.
  const path = url.startsWith(SITE) ? url.slice(SITE.length) || "/" : "/";
  const bare = path.replace(/^\/(bg|en)(?=\/|$)/i, "") || "/";
  const bgUrl = `${SITE}${bare}`;
  const enUrl = `${SITE}/en${bare === "/" ? "" : bare}`;
  // Google truncates titles around ~60 chars. Keep the brand-suffixed title if it fits,
  // otherwise trim to 57 + ellipsis so we control the cut-off rather than the SERP.
  const fullTitle = title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title;
  const desc = description.length > 160 ? description.slice(0, 157) + "…" : description;
  const lds = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const isEn = /^\/en(\/|$)/i.test(path);
  const ogLocale = isEn ? "en_US" : "bg_BG";

  return (
    <Helmet>
      <html lang={isEn ? "en" : "bg"} />
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
      )}

      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:site_name" content="Dogovori.net" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />
      <meta property="og:image:alt" content={fullTitle} />
      {image === DEFAULT_IMAGE && (
        <>
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:type" content="image/jpeg" />
        </>
      )}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={fullTitle} />

      <meta name="geo.region" content="BG" />
      <meta name="geo.placename" content="Bulgaria" />
      <link rel="alternate" hrefLang="bg-BG" href={bgUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="x-default" href={bgUrl} />


      {lds.map((ld, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
}
