import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";

// Every lazy boundary goes through lazyRetry so a failed dynamic import
// (typically a stale index.html pointing at chunks removed by a new deploy)
// retries once and then hard-reloads with a cache-buster, instead of leaving
// a permanent blank screen.
const lazy = lazyRetry;
const reactLazy = lazyRetry;

import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { detectLocaleFromPath, setLocale, stripLocaleFromPath } from "@/i18n/locale";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useIsMobileViewport } from "@/hooks/useMediaQuery";

import Index from "./pages/Index.tsx";
const PaymentTestModeBanner = reactLazy(() =>
  import("@/components/PaymentTestModeBanner").then((m) => ({ default: m.PaymentTestModeBanner })),
);
const CookieBanner = reactLazy(() =>
  import("@/components/CookieBanner").then((m) => ({ default: m.CookieBanner })),
);
const AIDisclaimerModal = reactLazy(() =>
  import("@/components/AIDisclaimerModal").then((m) => ({ default: m.AIDisclaimerModal })),
);
const UnfilledPlaceholdersModal = reactLazy(() =>
  import("@/components/UnfilledPlaceholdersModal").then((m) => ({ default: m.UnfilledPlaceholdersModal })),
);
const UsernamePrompt = reactLazy(() =>
  import("@/components/auth/UsernamePrompt").then((m) => ({ default: m.UsernamePrompt })),
);
const GlobalProUpgradeListener = reactLazy(() =>
  import("@/components/ProConversionToast").then((m) => ({ default: m.GlobalProUpgradeListener })),
);
const CommandPalette = reactLazy(() =>
  import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
// FloatingCommandTrigger removed — Cmd/Ctrl+K still opens the CommandPalette globally.
const DogovAIBubble = reactLazy(() =>
  import("@/components/DogovAIBubble").then((m) => ({ default: m.DogovAIBubble })),
);
const MobileBottomNav = reactLazy(() =>
  import("@/components/MobileBottomNav").then((m) => ({ default: m.MobileBottomNav })),
);
const MobileAssistantOpenBridge = reactLazy(() =>
  import("@/components/MobileAssistantOpenBridge").then((m) => ({
    default: m.MobileAssistantOpenBridge,
  })),
);
const ActionCelebrationHost = reactLazy(() =>
  import("@/components/ActionCelebration").then((m) => ({ default: m.ActionCelebrationHost })),
);
const AuthGateModal = reactLazy(() =>
  import("@/components/AuthGateModal").then((m) => ({ default: m.AuthGateModal })),
);
const InlineAuthDialog = reactLazy(() =>
  import("@/components/auth/InlineAuthDialog").then((m) => ({ default: m.InlineAuthDialog })),
);

const Sonner = reactLazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })),
);
const BetaDisclaimerModal = reactLazy(() =>
  import("@/components/BetaDisclaimerModal").then((m) => ({ default: m.BetaDisclaimerModal })),
);
const ExitIntentLeadMagnet = reactLazy(() =>
  import("@/components/funnel/ExitIntentLeadMagnet").then((m) => ({ default: m.ExitIntentLeadMagnet })),
);
const StartStoryOverlay = reactLazy(() =>
  import("@/components/funnel/StartStoryOverlay").then((m) => ({ default: m.StartStoryOverlay })),
);
const EntrepreneurAdPopup = reactLazy(() =>
  import("@/components/funnel/EntrepreneurAdPopup").then((m) => ({ default: m.EntrepreneurAdPopup })),
);
const FreeWelcomeDialog = reactLazy(() =>
  import("@/components/paywall/FreeWelcomeDialog").then((m) => ({ default: m.FreeWelcomeDialog })),
);
// Sentry init is deferred to idle time below — keeps it off the critical path.

// Lazy-load every route except Index (landing page) so the initial bundle stays light.
// Heavy deps (jspdf, docx, templateContent ~808KB) only load when their route is visited.
const Template = lazy(() => import("./pages/Template.tsx"));
const Wizard = lazy(() => import("./pages/Wizard.tsx"));
const BuildContract = lazy(() => import("./pages/BuildContract.tsx"));
const WizardBilingual = lazy(() => import("./pages/WizardBilingual.tsx"));
const WizardGraphRedirect = lazy(() => import("./pages/WizardGraphRedirect.tsx"));
const DocumentWorkspace = lazy(() => import("./pages/DocumentWorkspace.tsx"));

const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const Start = lazy(() => import("./pages/Start.tsx"));
const Products = lazy(() => import("./pages/Products.tsx"));
const ProductDetail = lazy(() => import("./pages/ProductDetail.tsx"));
const ProductCheckout = lazy(() => import("./pages/ProductCheckout.tsx"));
const ProductResult = lazy(() => import("./pages/ProductResult.tsx"));
const Analyze = lazy(() => import("./pages/Analyze.tsx"));
const ProcessStep = lazy(() => import("./pages/ProcessStep.tsx"));
const Tools = lazy(() => import("./pages/Tools.tsx"));
const ToolDetail = lazy(() => import("./pages/ToolDetail.tsx"));

const Category = lazy(() => import("./pages/Category.tsx"));
const Sector = lazy(() => import("./pages/Sector.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));
const Connect = lazy(() => import("./pages/Connect.tsx"));
const VerifySignature = lazy(() => import("./pages/VerifySignature.tsx"));

const Account = lazy(() => import("./pages/Account.tsx"));
const Console = lazy(() => import("./pages/Console.tsx"));
const DocumentPage = lazy(() => import("./pages/Document.tsx"));
const UploadedContract = lazy(() => import("./pages/UploadedContract.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminAITraining = lazy(() => import("./pages/AdminAITraining.tsx"));
const AdminAiSimulation = lazy(() => import("./pages/AdminAiSimulation.tsx"));
const AdminSubscriptions = lazy(() => import("./pages/AdminSubscriptions.tsx"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics.tsx"));
const AdminPrivacy = lazy(() => import("./pages/AdminPrivacy.tsx"));
const AdminIllegalContent = lazy(() => import("./pages/AdminRestrictedProcessing.tsx"));
const AdminPenTest = lazy(() => import("./pages/AdminPenTest.tsx"));
const AdminRestoreDrills = lazy(() => import("./pages/AdminRestoreDrills.tsx"));
const AdminCompliance = lazy(() => import("./pages/AdminCompliance.tsx"));
const AdminVendors = lazy(() => import("./pages/AdminVendors.tsx"));
const AdminBreaches = lazy(() => import("./pages/AdminBreaches.tsx"));
const AdminAiPostMarket = lazy(() => import("./pages/AdminAiPostMarket.tsx"));
const AdminTraining = lazy(() => import("./pages/AdminTraining.tsx"));
const AdminLegalKB = lazy(() => import("./pages/AdminLegalKB.tsx"));
const AdminLegalMonitor = lazy(() => import("./pages/AdminLegalMonitor.tsx"));
const AdminPlans = lazy(() => import("./pages/AdminPlans.tsx"));
const AdminPerf = lazy(() => import("./pages/AdminPerf.tsx"));
const AdminFunnel = lazy(() => import("./pages/AdminFunnel.tsx"));
const AdminGenHealth = lazy(() => import("./pages/AdminGenHealth.tsx"));
const AdminBots = lazy(() => import("./pages/AdminBots.tsx"));
const AdminMetrics = lazy(() => import("./pages/AdminMetrics.tsx"));
const AdminScorecard = lazy(() => import("./pages/AdminScorecard.tsx"));
const AdminGrowthBrief = lazy(() => import("./pages/AdminGrowthBrief.tsx"));
const AdminAiJson = lazy(() => import("./pages/AdminAiJson.tsx"));
const AdminFinancials = lazy(() => import("./pages/AdminFinancials.tsx"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn.tsx"));
const Plans = lazy(() => import("./pages/Plans.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Assistant = lazy(() => import("./pages/Assistant.tsx"));
const Terms = lazy(() => import("./pages/legal/Terms.tsx"));
const Privacy = lazy(() => import("./pages/legal/Privacy.tsx"));
const Cookies = lazy(() => import("./pages/legal/Cookies.tsx"));
const Refund = lazy(() => import("./pages/legal/Refund.tsx"));
const PurchaseTerms = lazy(() => import("./pages/legal/PurchaseTerms.tsx"));
const Contacts = lazy(() => import("./pages/legal/Contacts.tsx"));
const ProviderInfo = lazy(() => import("./pages/legal/ProviderInfo.tsx"));
const WithdrawalForm = lazy(() => import("./pages/legal/WithdrawalForm.tsx"));
const DPA = lazy(() => import("./pages/legal/DPA.tsx"));
const AIProcessingPolicy = lazy(() => import("./pages/legal/AIProcessingPolicy.tsx"));
const RetentionPolicy = lazy(() => import("./pages/legal/RetentionPolicy.tsx"));
const SubprocessorRegister = lazy(() => import("./pages/legal/SubprocessorRegister.tsx"));
const ModelRoutingPolicy = lazy(() => import("./pages/legal/ModelRoutingPolicy.tsx"));
const IncidentResponse = lazy(() => import("./pages/legal/IncidentResponse.tsx"));
const ROPA = lazy(() => import("./pages/legal/ROPA.tsx"));
const DpiaSummary = lazy(() => import("./pages/legal/DpiaSummary.tsx"));
const SecurityPolicy = lazy(() => import("./pages/legal/SecurityPolicy.tsx"));
const Changelog = lazy(() => import("./pages/legal/Changelog.tsx"));
const KnowledgeBase = lazy(() => import("./pages/legal/KnowledgeBase.tsx"));
const LegalIndex = lazy(() => import("./pages/legal/LegalIndex.tsx"));
const SharedDocument = lazy(() => import("./pages/SharedDocument.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const BlogUserPost = lazy(() => import("./pages/BlogUserPost.tsx"));
const BlogSubmit = lazy(() => import("./pages/BlogSubmit.tsx"));
const Team = lazy(() => import("./pages/Team.tsx"));
const TeamSSO = lazy(() => import("./pages/TeamSSO.tsx"));
const TeamAccept = lazy(() => import("./pages/TeamAccept.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const Downloads = lazy(() => import("./pages/Downloads.tsx"));
const SiteMap = lazy(() => import("./pages/SiteMap.tsx"));
const AIFeatures = lazy(() => import("./pages/AIFeatures.tsx"));
const Kits = lazy(() => import("./pages/Kits.tsx"));
const KitDetail = lazy(() => import("./pages/KitDetail.tsx"));
const MyKitDetail = lazy(() => import("./pages/MyKitDetail.tsx"));
const CreateKit = lazy(() => import("./pages/CreateKit.tsx"));
const Sign = lazy(() => import("./pages/Sign.tsx"));
const SigningEnvelope = lazy(() => import("./pages/SigningEnvelope.tsx"));
const Glossary = lazy(() => import("./pages/Glossary.tsx"));
const GlossaryTerm = lazy(() => import("./pages/GlossaryTerm.tsx"));
const CompareTemplates = lazy(() => import("./pages/CompareTemplates.tsx"));
const RiskAnalysisDemo = lazy(() => import("./pages/demo/RiskAnalysisDemo.tsx"));
const BilingualDemo = lazy(() => import("./pages/demo/BilingualDemo.tsx"));
const ESignatureDemo = lazy(() => import("./pages/demo/ESignatureDemo.tsx"));
const Feedback = lazy(() => import("./pages/Feedback.tsx"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback.tsx"));
const AdminHomeTestimonials = lazy(() => import("./pages/AdminHomeTestimonials.tsx"));
const MyReviews = lazy(() => import("./pages/MyReviews.tsx"));


// Defer Sentry boot until the browser is idle so it never competes with hydration / LCP.
if (typeof window !== "undefined") {
  const boot = () => import("@/lib/sentry").then((m) => m.initSentry());
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(boot, { timeout: 4000 });
  } else {
    setTimeout(boot, 2000);
  }
}

// Warm the route chunks for /ai and /karta on idle. These are GEO-targeted SEO
// landing pages — users frequently arrive via SERP/AI-search and follow the
// internal links from the homepage. Triggering the dynamic imports during idle
// time turns the navigation into an instant transition without bloating the
// initial entry chunk (each page is still its own lazy chunk).
// JSON-LD dedup remains handled in main.tsx, so prefetching doesn't re-inject
// structured data — only the JS chunk is fetched and cached by the browser.
// NOTE: /karta (SiteMap) is deliberately NOT warmed — it statically pulls the
// sectors + blog data chunks (~340KB transferred), which dominated the landing
// page network budget for a page most visitors never open. It is still lazy on
// hover/click via PrefetchLink.
if (typeof window !== "undefined" && location.pathname !== "/ai") {
  const prefetchRoutes = () => {
    void import("@/lib/routePrefetch").then((m) => {
      if (m.shouldPrefetch()) void import("./pages/AIFeatures.tsx");
    });
  };
  const start = () => {
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(prefetchRoutes, { timeout: 6000 });
    } else {
      setTimeout(prefetchRoutes, 4000);
    }
  };
  if (document.readyState === "complete") setTimeout(start, 3000);
  else window.addEventListener("load", () => setTimeout(start, 3000), { once: true });
}


// The QueryClient is the shared cache for React Query. It lives in a
// dedicated module so imperative helpers (e.g. useQuota's fetchQuotaCached /
// invalidateQuota) can hit the exact same client outside a component tree.
import { queryClient } from "@/lib/queryClient";

const RouteFallback = () => (
  <div className="flex min-h-dvh items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
  </div>
);

/**
 * Mount non-critical global overlays (bubbles, banners, exit-intent, etc.)
 * only after the browser is idle. Keeps the initial paint focused on the
 * primary route and delays ~15 lazy chunk fetches that used to compete with
 * the LCP image and route bundle.
 */
function DeferredOverlays() {
  const [ready, setReady] = useState(false);
  // На телефон монтираме само необходимото за безопасност/плащане и долната
  // навигация — никакви наслоени плаващи помощници и изскачащи прозорци.
  const isMobile = useIsMobileViewport();
  useEffect(() => {
    const idle =
      (window as any).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 1500));
    const cancel =
      (window as any).cancelIdleCallback ?? ((h: number) => clearTimeout(h));
    const handle = idle(() => setReady(true), { timeout: 3000 });
    return () => cancel(handle);
  }, []);
  if (!ready) return null;
  // Точно три на телефон: платежна лента, бисквитки и долната навигация.
  // Всякакви предупреждения се показват вградено при самото действие/резултат.
  if (isMobile) {
    return (
      <Suspense fallback={null}>
        <PaymentTestModeBanner />
        <CookieBanner />
        <MobileBottomNav />
        <MobileAssistantOpenBridge />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <PaymentTestModeBanner />
      <CookieBanner />
      <BetaDisclaimerModal />
      <ExitIntentLeadMagnet />
      <UsernamePrompt />
      <GlobalProUpgradeListener />
      <CommandPalette />
      {/* Only one floating helper — the DogovAI bubble. */}
      <DogovAIBubble />
      <MobileBottomNav />
      <ActionCelebrationHost />
      <EntrepreneurAdPopup />
      <FreeWelcomeDialog />
    </Suspense>
  );
}


const AnimatedRoutes = () => {
  const location = useLocation();
  const locale = detectLocaleFromPath(location.pathname);
  useEffect(() => { setLocale(locale); }, [locale]);
  useEffect(() => {
    (async () => {
      const { trackPageview, installPageviewLifecycleHooks } = await import("@/lib/pageviewTracker");
      installPageviewLifecycleHooks();
      trackPageview(location.pathname + location.search);
    })();
  }, [location.pathname, location.search]);
  // For /en/* URLs, strip the prefix so existing <Route path="/..."> entries match.
  const routedLocation = locale === "bg"
    ? location
    : { ...location, pathname: stripLocaleFromPath(location.pathname) };
  return (
    <div key={location.pathname} className="route-fade">
      <Routes location={routedLocation}>
        <Route path="/" element={<Index />} />
        <Route path="/proces/:slug" element={<ProcessStep />} />
        <Route path="/demo/risk-analysis" element={<RiskAnalysisDemo />} />
        <Route path="/demo/bilingual" element={<BilingualDemo />} />
        <Route path="/demo/e-signature" element={<ESignatureDemo />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/assistant/:threadId" element={<Assistant />} />
        <Route path="/wizard/:sectorId" element={<Wizard />} />
        <Route path="/build" element={<BuildContract />} />
        <Route path="/wizard-bilingual/:sectorId" element={<WizardBilingual />} />
        <Route path="/wizard-graph/:slug" element={<WizardGraphRedirect />} />
        <Route path="/wizard-graph/:slug/review" element={<WizardGraphRedirect />} />
        <Route path="/workspace/:slug/:kind" element={<DocumentWorkspace />} />

        <Route path="/catalog" element={<Catalog />} />
        <Route path="/start" element={<Start />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/:slug" element={<ToolDetail />} />

        <Route path="/komplekti" element={<Kits />} />
        <Route path="/komplekti/nov" element={<ProtectedRoute><CreateKit /></ProtectedRoute>} />
        <Route path="/komplekti/moi/:id" element={<ProtectedRoute><MyKitDetail /></ProtectedRoute>} />
        <Route path="/komplekti/:slug" element={<KitDetail />} />
        <Route path="/karta" element={<SiteMap />} />
        <Route path="/ai" element={<AIFeatures />} />
        <Route path="/kategoria/:slug" element={<Category />} />
        <Route path="/sektor/:id" element={<Sector />} />
        <Route path="/shablon/:slug" element={<Template />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/produkti" element={<Products />} />
        {/* Изтеглената „Бизнес карта на документите" → каноничния пълен пакет. */}
        <Route path="/produkti/biznes-karta" element={<Navigate to="/produkti/palen-paket-pregovori" replace />} />
        <Route path="/produkti/biznes-karta-dokumenti" element={<Navigate to="/produkti/palen-paket-pregovori" replace />} />
        {/* Самостоятелните продуктови страници — стабилни ASCII slug-ове. */}
        {/* Покупката и състоянието на поръчката — само за влезли потребители. */}
        <Route path="/produkti/rezultat" element={<ProtectedRoute><ProductResult /></ProtectedRoute>} />
        <Route
          path="/produkti/:slug/start"
          element={<ProtectedRoute><ProductCheckout /></ProtectedRoute>}
        />
        <Route path="/produkti/:slug" element={<ProductDetail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route path="/connect" element={<Connect />} />

        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/account?tab=dashboard" replace />} />
        <Route path="/analiz" element={<Analyze />} />
        <Route path="/analyze" element={<Navigate to="/analiz" replace />} />
        <Route path="/console/analysis" element={<ProtectedRoute><Navigate to="/analiz" replace /></ProtectedRoute>} />
        <Route path="/console" element={<ProtectedRoute><Console /></ProtectedRoute>} />
        <Route path="/console/:section" element={<ProtectedRoute><Console /></ProtectedRoute>} />
        <Route path="/console/:section/:entityId" element={<ProtectedRoute><Console /></ProtectedRoute>} />
        <Route path="/document/:id" element={<ProtectedRoute><DocumentPage /></ProtectedRoute>} />
        <Route path="/uploaded/:id" element={<ProtectedRoute><UploadedContract /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/admin/ai-training" element={<ProtectedRoute><AdminAITraining /></ProtectedRoute>} />
        <Route path="/admin/ai-simulation" element={<ProtectedRoute><AdminAiSimulation /></ProtectedRoute>} />
        <Route path="/admin/subscriptions" element={<ProtectedRoute><AdminSubscriptions /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
        <Route path="/admin/funnel" element={<ProtectedRoute><AdminFunnel /></ProtectedRoute>} />
        <Route path="/admin/generation" element={<ProtectedRoute><AdminGenHealth /></ProtectedRoute>} />
        <Route path="/admin/bots" element={<ProtectedRoute><AdminBots /></ProtectedRoute>} />
        <Route path="/admin/metrics" element={<ProtectedRoute><AdminMetrics /></ProtectedRoute>} />
        <Route path="/admin/scorecard" element={<ProtectedRoute><AdminScorecard /></ProtectedRoute>} />
        <Route path="/admin/growth-brief" element={<ProtectedRoute><AdminGrowthBrief /></ProtectedRoute>} />
        <Route path="/admin/ai-json" element={<ProtectedRoute><AdminAiJson /></ProtectedRoute>} />
        <Route path="/admin/privacy" element={<ProtectedRoute><AdminPrivacy /></ProtectedRoute>} />
        <Route path="/admin/privacy/illegal" element={<ProtectedRoute><AdminIllegalContent /></ProtectedRoute>} />
        <Route path="/admin/pentest" element={<ProtectedRoute><AdminPenTest /></ProtectedRoute>} />
        <Route path="/admin/restore-drills" element={<ProtectedRoute><AdminRestoreDrills /></ProtectedRoute>} />
        <Route path="/admin/compliance" element={<ProtectedRoute><AdminCompliance /></ProtectedRoute>} />
        <Route path="/admin/vendors" element={<ProtectedRoute><AdminVendors /></ProtectedRoute>} />
        <Route path="/admin/breaches" element={<ProtectedRoute><AdminBreaches /></ProtectedRoute>} />
        <Route path="/admin/ai-post-market" element={<ProtectedRoute><AdminAiPostMarket /></ProtectedRoute>} />
        <Route path="/admin/training" element={<ProtectedRoute><AdminTraining /></ProtectedRoute>} />
        <Route path="/admin/legal-kb" element={<ProtectedRoute><AdminLegalKB /></ProtectedRoute>} />
        <Route path="/admin/legal-monitor" element={<ProtectedRoute><AdminLegalMonitor /></ProtectedRoute>} />
        <Route path="/admin/plans" element={<ProtectedRoute><AdminPlans /></ProtectedRoute>} />
        <Route path="/admin/perf" element={<ProtectedRoute><AdminPerf /></ProtectedRoute>} />
        <Route path="/admin/financials" element={<ProtectedRoute><AdminFinancials /></ProtectedRoute>} />
        <Route path="/checkout/return" element={<CheckoutReturn />} />
        <Route path="/legal" element={<LegalIndex />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/provider-info" element={<ProviderInfo />} />
        <Route path="/withdrawal-form" element={<WithdrawalForm />} />
        <Route path="/dpa" element={<DPA />} />
        <Route path="/legal/ai-processing" element={<AIProcessingPolicy />} />
        <Route path="/legal/retention" element={<RetentionPolicy />} />
        <Route path="/legal/subprocessors" element={<SubprocessorRegister />} />
        <Route path="/legal/model-routing" element={<ModelRoutingPolicy />} />
        <Route path="/legal/incident-response" element={<IncidentResponse />} />
        <Route path="/legal/ropa" element={<ROPA />} />
        <Route path="/legal/dpia-summary" element={<DpiaSummary />} />
        <Route path="/legal/security" element={<SecurityPolicy />} />
        <Route path="/legal/changelog" element={<Changelog />} />
        <Route path="/legal/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/share/:token" element={<SharedDocument />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/submit" element={<BlogSubmit />} />
        <Route path="/blog/u/:slug" element={<BlogUserPost />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
        <Route path="/team/accept" element={<TeamAccept />} />
        <Route path="/team/sso" element={<ProtectedRoute><TeamSSO /></ProtectedRoute>} />
        <Route path="/contact/:id" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
        <Route path="/downloads/contracts" element={<ProtectedRoute><Downloads kind="contract" /></ProtectedRoute>} />
        <Route path="/downloads/templates" element={<ProtectedRoute><Downloads kind="template" /></ProtectedRoute>} />
        <Route path="/sign/:token" element={<Sign />} />
        <Route path="/verify" element={<VerifySignature />} />
        <Route path="/verify/:id" element={<VerifySignature />} />
        <Route path="/signing/:id" element={<ProtectedRoute><SigningEnvelope /></ProtectedRoute>} />
        <Route path="/rechnik" element={<Glossary />} />
        <Route path="/rechnik/:slug" element={<GlossaryTerm />} />
        <Route path="/sravni" element={<CompareTemplates />} />
        <Route path="/sravni/:a/vs/:b" element={<CompareTemplates />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/admin/feedback" element={<ProtectedRoute><AdminFeedback /></ProtectedRoute>} />
        <Route path="/admin/home-testimonials" element={<ProtectedRoute><AdminHomeTestimonials /></ProtectedRoute>} />
        <Route path="/moite-revyuta" element={<MyReviews />} />

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

import { ThemeProvider } from "@/hooks/useTheme";

const App = () => (
  <ThemeProvider>
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Suspense fallback={null}>
        <Sonner />
      </Suspense>

      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <AuthProvider>
          <OnboardingProvider>
          <Suspense fallback={null}>
            <AuthGateModal />
            <InlineAuthDialog />

            <StartStoryOverlay />
            <AIDisclaimerModal />
            <UnfilledPlaceholdersModal />
          </Suspense>
          <DeferredOverlays />
          <Suspense fallback={<RouteFallback />}>
            <AnimatedRoutes />
          </Suspense>
          </OnboardingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
  </ThemeProvider>
);


export default App;
