/**
 * Богатата десктоп композиция на началната страница.
 *
 * Живее в отделен модул, който се зарежда лениво САМО за екрани ≥768px —
 * така десктоп-only модулите (Hero, PrimaryChoice, BackdropSection и всички
 * дълги секции) не влизат в мобилния граф на входа.
 */
import { lazy, Suspense } from "react";
import { Hero } from "@/components/Hero";
import { SeoFooter } from "@/components/SeoFooter";
import { LazyOnVisible } from "@/components/LazyOnVisible";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { PrimaryChoice } from "@/components/home/PrimaryChoice";
import { BackdropSection } from "@/components/SectionBackdrop";

const ProductsSection = lazy(() => import("@/components/home/ProductsSection").then((m) => ({ default: m.ProductsSection })));
const PlatformCapabilities = lazy(() => import("@/components/PlatformCapabilities").then((m) => ({ default: m.PlatformCapabilities })));
const BrandedDocumentShowcase = lazy(() => import("@/components/home/BrandedDocumentShowcase").then((m) => ({ default: m.BrandedDocumentShowcase })));
const DogovaryAIShowcase = lazy(() => import("@/components/home/DogovaryAIShowcase").then((m) => ({ default: m.DogovaryAIShowcase })));
const SocialProofStrip = lazy(() => import("@/components/SocialProofStrip").then((m) => ({ default: m.SocialProofStrip })));
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
    <main className="route-fade" data-home-variant="desktop">
      <Hero />

      {/* Social proof веднага под херото — зарежда се веднага, без lazy gate */}
      <Suspense fallback={<SectionSkeleton />}>
        <SocialProofStrip />
      </Suspense>

      {/* Продуктите са първата съдържателна секция след social proof */}
      <LazyOnVisible minHeight={520}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="center">
            <ProductsSection />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      {/* DogovaryAI веднага след продуктите — видим е и на телефон, рано. */}
      <LazyOnVisible minHeight={520}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings" align="center">
            <DogovaryAIShowcase />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <BackdropSection variant="rings">
        <PrimaryChoice />
      </BackdropSection>

      <LazyOnVisible minHeight={420}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="papers" align="bottom">
            <FeaturedBlanks />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={420}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="top">
            <PlatformCapabilities />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      {/* Персонално брандиране — веднага под функциите на приложението */}
      <LazyOnVisible minHeight={520}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots" align="center">
            <BrandedDocumentShowcase />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      {/* Готови комплекти */}
      <LazyOnVisible minHeight={480}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings">
            <LifeScenarios />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={420}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots">
            <Testimonials />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={480}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="rings">
            <PainSolution />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={420}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="grid" align="center">
            <ComparisonTable />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={420}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="shield" intensity="medium">
            <ComplianceSection />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={480}>
        <Suspense fallback={<SectionSkeleton />}>
          <BackdropSection variant="dots">
            <FAQ />
          </BackdropSection>
        </Suspense>
      </LazyOnVisible>

      <LazyOnVisible minHeight={300}>
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
