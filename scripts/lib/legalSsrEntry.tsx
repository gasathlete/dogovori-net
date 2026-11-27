import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import TermsPage from "../../src/pages/legal/Terms";
import PrivacyPage from "../../src/pages/legal/Privacy";
import CookiesPage from "../../src/pages/legal/Cookies";
import RefundPage from "../../src/pages/legal/Refund";

/** Render the approved source components, including their real layout and date. */
export function renderLegalPages() {
  return ([
    ["/terms", TermsPage], ["/privacy", PrivacyPage],
    ["/cookies", CookiesPage], ["/refund", RefundPage],
  ] as const).map(([path, Page]) => {
    // These static pages return LegalLayout and contain no hooks. Rendering the
    // returned element below still executes the real layout through React SSR.
    const element = Page();
    const { title, description } = element.props;
    const bodyHtml = renderToStaticMarkup(
      <HelmetProvider><StaticRouter location={path}>{element}</StaticRouter></HelmetProvider>,
    );
    return {
      path, title: `${title} · Dogovori.net`, description, bodyHtml,
      jsonLd: [{ "@context": "https://schema.org", "@type": "WebPage", name: title, url: `https://dogovori.net${path}` }],
    };
  });
}
