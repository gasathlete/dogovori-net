import { PRICING_PLANS, fmtEur } from "../../src/lib/pricing";
import { ONE_TIME_PRODUCTS } from "../../src/lib/products";

export interface FunnelSeoPage {
  path: string;
  title: string;
  description: string;
  bodyHtml: string;
  jsonLd: Record<string, unknown>[];
  noindex?: boolean;
}

export function buildFunnelSeoPages(): FunnelSeoPage[] {
  const privatePaths = ["/auth", "/reset-password", "/account", "/checkout/return", "/produkti/rezultat", ...ONE_TIME_PRODUCTS.map(p => `/produkti/${p.slug}/start`)];
  return [{
    path: "/plans", title: "Планове и цени — Dogovori.net",
    description: "Планове за редовна работа с документи. Сравнете цените и включените операции. Платените услуги се избират отделно.",
    bodyHtml: `<main><h1>Платете според начина, по който работите</h1><p>Планове за редовна работа с документи.</p>${Object.values(PRICING_PLANS).map(p => `<section><h2>${p.name}</h2><p>${p.monthly === null ? "" : `${fmtEur(p.monthly)} месечно. `}${p.yearly === null ? "" : `${fmtEur(p.yearly)} годишно${p.monthly === null ? " на място" : ""}.`}</p></section>`).join("")}<p>Цените включват ДДС. <a href="/produkti">Еднократни продукти</a> · <a href="/auth?tab=signup&amp;redirect=%2Fplans">Регистрирай се безплатно</a></p></main>`,
    jsonLd: [],
  }, ...privatePaths.map(path => ({ path, title: path === "/auth" ? "Вход и регистрация — Dogovori.net" : "Вашият профил и документи — Dogovori.net", description: "Защитена страница за Вашия профил, документи или състояние на покупката.", bodyHtml: "", jsonLd: [], noindex: true }))];
}