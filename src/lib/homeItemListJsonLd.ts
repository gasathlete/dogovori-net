/**
 * ItemList структурираните данни за началната страница се строят само когато
 * реално ще бъдат ползвани (десктоп, при свободна мрежа). Каталожният индекс
 * се внася динамично, за да не влиза в входния граф на телефона.
 *
 * Данните са верни или липсват — никога не се измисля списък.
 */
export async function buildHomeItemListJsonLd(): Promise<Record<string, unknown> | null> {
  const [{ FEATURED_BLANKS }, { default: slugs }] = await Promise.all([
    import("@/data/featuredBlanks"),
    import("@/data/footerAnchors.generated.json"),
  ]);
  const slugMap = new Map(Object.entries(slugs as Record<string, string>));
  const itemListElement = FEATURED_BLANKS.map((b, i) => {
    const slug = slugMap.get(b.docName);
    if (!slug) return null;
    return {
      "@type": "ListItem",
      position: i + 1,
      name: b.shortLabel,
      url: `https://dogovori.net/shablon/${slug}`,
    };
  }).filter(Boolean);
  if (itemListElement.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Избрани от Договори нет — Топ 5 най-търсени бланки",
    itemListElement,
  };
}
