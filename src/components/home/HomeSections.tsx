/**
 * Пълната композиция на началната страница — една и съща за телефон и десктоп.
 *
 * Модулът се зарежда лениво само за да не влиза в първия bundle; съдържанието,
 * заглавията и метаданните са идентични при всички размери на екрана.
 */
import { lazy, Suspense } from "react";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { BackdropSection } from "@/components/SectionBackdrop";

const ProductsSection = lazy(() => import("@/components/home/ProductsSection").then((m) => ({ default: m.ProductsSection })));
const PlatformCapabilities = lazy(() => import("@/components/PlatformCapabilities").then((m) => ({ default: m.PlatformCapabilities })));
const BrandedDocumentShowcase = lazy(() => import("@/components/home/BrandedDocumentShowcase").then((m) => ({ default: m.BrandedDocumentShowcase })));
const DogovaryAIShowcase = lazy(() => import("@/components/home/DogovaryAIShowcase").then((m) => ({ default: m.DogovaryAIShowcase })));
const SocialProofStrip = lazy(() => import("@/components/SocialProofStrip").then((m) => ({ default: m.SocialProofStrip })));
const SectorPackages = lazy(() => import("@/components/home/SectorPackages").then((m) => ({ default: m.SectorPackages })));
const AdSpotlight = lazy(() => import("@/components/home/AdSpotlight").then((m) => ({ default: m.AdSpotlight })));
const PainSolution = lazy(() => import("@/components/PainSolution").then((m) => ({ default: m.PainSolution })));
const FeaturedBlanks = lazy(() => import("@/components/FeaturedBlanks").then((m) => ({ default: m.FeaturedBlanks })));
const LifeScenarios = lazy(() => import("@/components/LifeScenarios").then((m) => ({ default: m.LifeScenarios })));
const ComparisonTable = lazy(() => import("@/components/ComparisonTable").then((m) => ({ default: m.ComparisonTable })));
const Testimonials = lazy(() => import("@/components/Testimonials").then((m) => ({ default: m.Testimonials })));
const FAQ = lazy(() => import("@/components/FAQ").then((m) => ({ default: m.FAQ })));
const ComplianceSection = lazy(() => import("@/components/ComplianceSection").then((m) => ({ default: m.ComplianceSection })));
const CTABand = lazy(() => import("@/components/CTABand").then((m) => ({ default: m.CTABand })));

export function HomeSections() {
  return (
    <main data-home-variant="responsive">
      <Hero />

      {/* Social proof веднага под херото — зарежда се веднага, без lazy gate */}
      <Suspense fallback={<SectionSkeleton />}>
        <SocialProofStrip />
      </Suspense>

      {/* Пакети и комплекти стоят последователно, непосредствено след доверието. */}
      <LazyOnVisible minHeight={[2556, 1904, 1150]}>
        <Suspense fallback={<SectionSkeleton />}>
          <SectorPackages />
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[2229, 1046, 1062]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings">
            <LifeScenarios />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[3485, 4060, 1562]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="center">
            <ProductsSection />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[887, 805, 805]}>
        <Suspense fallback={<SectionSkeleton />}>
          <AdSpotlight />
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1481, 1284, 902]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings" align="center">
            <DogovaryAIShowcase />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      {/* Персонално брандиране — веднага под функциите на приложението */}
      <LazyOnVisible minHeight={[1420, 1250, 755]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots" align="center">
            <BrandedDocumentShowcase />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1909, 1432, 868]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="papers" align="bottom">
            <FeaturedBlanks />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1041, 767, 618]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="top">
            <PlatformCapabilities />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[745, 860, 836]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots">
            <Testimonials />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1111, 941, 790]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings">
            <PainSolution />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1505, 838, 780]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="center">
            <ComparisonTable />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1517, 1206, 1041]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="shield" intensity="medium">
            <ComplianceSection />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[1312, 1355, 1355]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots">
            <FAQ />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={[633, 732, 715]}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="flow" align="center">
            <CTABand />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <SeoFooter />
    </main>
  );
}

export default HomeSections;
