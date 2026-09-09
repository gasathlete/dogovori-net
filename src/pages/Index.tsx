import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { prefetchOnIdle, shouldPrefetch } from "@/lib/routePrefetch";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { MobileHero } from "@/components/home/MobileHero";
import { MobileTrustRow } from "@/components/home/MobileTrustRow";
import { MobileEssentials, MobileFinalCta } from "@/components/home/MobileEssentials";
import { useIsMobileViewport } from "@/hooks/useMediaQuery";
import { buildFaqJsonLd } from "@/data/faqItems";

// Кратката мобилна композиция е статична (малка и водеща за LCP), а цялата
// богата десктоп подредба живее в отделен ленив модул — така телефонът не
// изтегля нито Hero, нито PrimaryChoice, нито дългите секции.
const DesktopHome = lazy(() => import("@/components/home/DesktopHome").then((m) => ({ default: m.DesktopHome })));
const ProductsSection = lazy(() => import("@/components/home/ProductsSection").then((m) => ({ default: m.ProductsSection })));

const Index = () => {
  const location = useLocation();
  const isMobile = useIsMobileViewport();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      import("@/lib/scrollToHash").then(({ scrollToHash }) => scrollToHash(id, { updateHash: false }));
    }
  }, [location]);

  // Warm the most likely next route when the main thread is idle. На телефон
  // това се пропуска — мобилният път води към /produkti, не към каталога.
  useEffect(() => {
    if (isMobile) return;
    return prefetchOnIdle(["/catalog"]);
  }, [isMobile]);

  // Bridge legacy event name to the global DogovAI bubble
  useEffect(() => {
    const onOpen = () => window.dispatchEvent(new CustomEvent("dogovai:open"));
    window.addEventListener("dogovori:open-assistant", onOpen as EventListener);
    return () => window.removeEventListener("dogovori:open-assistant", onOpen as EventListener);
  }, []);

  // ItemList JSON-LD се строи само на десктоп и само след първото рисуване —
  // каталожният индекс (~260KB) никога не се зарежда на телефон.
  const [itemList, setItemList] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (isMobile || !shouldPrefetch()) return;
    let cancelled = false;
    const idle =
      (window as { requestIdleCallback?: (cb: () => void, o?: unknown) => number }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 600) as unknown as number);
    const handle = idle(async () => {
      const { buildHomeItemListJsonLd } = await import("@/lib/homeItemListJsonLd");
      const built = await buildHomeItemListJsonLd();
      if (!cancelled) setItemList(built);
    }, { timeout: 4000 });
    return () => {
      cancelled = true;
      const cic = (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cic) cic(handle);
      else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    };
  }, [isMobile]);

  const jsonLd = useMemo(
    () => (itemList ? [itemList, buildFaqJsonLd()] : [buildFaqJsonLd()]),
    [itemList],
  );

  return (
    <div className="min-h-dvh">
      <Seo
        title="Dogovori.net – договори от чернова до подпис на едно място"
        description="Изготвяне, преглед, сваляне и подписване на договори в един работен процес. Еднократно за конкретен документ или абонамент за редовна договорна работа."
        canonical="/"
        jsonLd={jsonLd}
      />
      <Header />
      {isMobile ? (
        <main className="route-fade pb-20" data-home-variant="mobile">
          <MobileHero />
          <MobileTrustRow />
          <Suspense fallback={<SectionSkeleton />}>
            <ProductsSection />
          </Suspense>
          <MobileEssentials />
          <MobileFinalCta />
          <SeoFooter />
        </main>
      ) : (
        <Suspense fallback={<SectionSkeleton />}>
          <DesktopHome />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
