import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { shouldPrefetch } from "@/lib/routePrefetch";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { buildFaqJsonLd } from "@/data/faqItems";

// Hero е над сгъвката, затова HomeSections се зарежда заедно със страницата
// (без skeleton и допълнителна заявка); секциите под сгъвката остават лениви.
import { HomeSections } from "@/components/home/HomeSections";

const Index = () => {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      import("@/lib/scrollToHash").then(({ scrollToHash }) => scrollToHash(id, { updateHash: false }));
    }
  }, [location]);


  // Каталогът не се зарежда предварително от началната страница; връзките към
  // него го зареждат при посочване/докосване (PrefetchLink).

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
        title="Dogovori.net — по-малко бюрокрация. Повече време за Вас."
        description="Помагаме на хората и малкия и средния бизнес да се справят с ежедневната бюрокрация. Образци, пояснения и подготовка за лични въпроси, работа и бизнес."
        canonical="/"
        jsonLd={jsonLd}
      />
      <Header />
      <HomeSections />
    </div>
  );
};

export default Index;
