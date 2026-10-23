/**
 * Композицията на началната страница — една и съща за телефон и десктоп.
 * Кратка редакционна подредба: търсене → доверие → пакети → комплекти →
 * продукти и планове → DogovaryAI → въпроси. Другите функции остават на
 * собствените си страници и в менюто.
 */
import { lazy, Suspense } from "react";
import { StickyScrollCta } from "@/components/funnel/StickyScrollCta";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";

const ProductsSection = lazy(() => import("@/components/home/ProductsSection").then((m) => ({ default: m.ProductsSection })));
const DogovaryAIShowcase = lazy(() => import("@/components/home/DogovaryAIShowcase").then((m) => ({ default: m.DogovaryAIShowcase })));
const SocialProofStrip = lazy(() => import("@/components/SocialProofStrip").then((m) => ({ default: m.SocialProofStrip })));
const SectorPackages = lazy(() => import("@/components/home/SectorPackages").then((m) => ({ default: m.SectorPackages })));
const LifeScenarios = lazy(() => import("@/components/LifeScenarios").then((m) => ({ default: m.LifeScenarios })));
const FAQ = lazy(() => import("@/components/FAQ").then((m) => ({ default: m.FAQ })));
const ProductExperience = lazy(() => import("@/components/home/ProductExperience").then((m) => ({ default: m.ProductExperience })));
const PlatformExperience = lazy(() => import("@/components/home/PlatformExperience").then((m) => ({ default: m.PlatformExperience })));
const ToolExperience = lazy(() => import("@/components/home/ToolExperience").then((m) => ({ default: m.ToolExperience })));

export function HomeSections() {
  return (
    <main data-home-variant="responsive">
      <Hero />

      <Suspense fallback={<SectionSkeleton />}>
        <SocialProofStrip />
      </Suspense>

      {/* Пакети и комплекти стоят последователно, непосредствено след доверието. */}
      <Suspense fallback={<SectionSkeleton />}>
        <SectorPackages />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LifeScenarios />
      </Suspense>

      <LazyOnVisible minHeight={[640, 520, 480]}>
        <Suspense fallback={<SectionSkeleton />}>
          <ProductsSection />
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[760, 600, 520]}>
        <Suspense fallback={<SectionSkeleton />}><ProductExperience /></Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[700, 640, 600]}>
        <Suspense fallback={<SectionSkeleton />}><PlatformExperience /></Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[640, 600, 520]}>
        <Suspense fallback={<SectionSkeleton />}><ToolExperience /></Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[760, 600, 520]}>
        <Suspense fallback={<SectionSkeleton />}>
          <DogovaryAIShowcase />
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[900, 800, 760]}>
        <Suspense fallback={<SectionSkeleton />}>
          <FAQ />
        </Suspense>
      </LazyOnVisible>

      <SeoFooter />
      <StickyScrollCta />
    </main>
  );
}

export default HomeSections;
