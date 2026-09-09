import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { prefetchOnIdle, shouldPrefetch } from "@/lib/routePrefetch";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { useIsMobileViewport } from "@/hooks/useMediaQuery";
import { buildFaqJsonLd } from "@/data/faqItems";

// Една и съща подредба на телефон и десктоп — богатият hero, социалното
// доказателство и продуктите. Модулът е ленив само за да не влиза в първия
// bundle; съдържанието и метаданните са идентични при двата размера.
const HomeSections = lazy(() => import("@/components/home/HomeSections").then((m) => ({ default: m.HomeSections })));

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

  // ItemList JSON-LD се строи след първото рисуване — еднакво на телефон и на
  // десктоп, за да са идентични метаданните при двата размера.
  const [itemList, setItemList] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!shouldPrefetch()) return;
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
  }, []);

  const jsonLd = useMemo(
    () => (itemList ? [itemList, buildFaqJsonLd()] : [buildFaqJsonLd()]),
    [itemList],
  );

  return (
    <div className="min-h-dvh">
      <Seo
        title="Dogovori.net — създайте, проверете или поправете документ"
        description="Започвате от шаблон или качвате свой файл. Виждате какво липсва и какво да промените. Плащате еднократно за един документ или абонамент за редовна работа."
        canonical="/"
        jsonLd={jsonLd}
      />
      <Header />
      <Suspense fallback={<SectionSkeleton />}>
        <HomeSections />
      </Suspense>
    </div>
  );
};

export default Index;
