import { lazy as reactLazy, Suspense, type ComponentType } from "react";

// Wrap React.lazy so that a failed dynamic import (typically caused by a stale
// index.html pointing to a vendor chunk that no longer exists after a deploy)
// triggers a one-time hard reload instead of a permanent blank screen.
const lazy = <T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  reactLazy(() =>
    factory()
      .then((mod) => {
        if (typeof window !== "undefined") sessionStorage.removeItem("lovable:chunk-reload");
        return mod;
      })
      .catch((err) => {
        const key = "lovable:chunk-reload";
        if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          return new Promise(() => {}) as Promise<{ default: T }>;
        }
        throw err;
      }),
  );
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index.tsx";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { CookieBanner } from "@/components/CookieBanner";
import { AIDisclaimerModal } from "@/components/AIDisclaimerModal";
// Sentry init is deferred to idle time below — keeps it off the critical path.

// Lazy-load every route except Index (landing page) so the initial bundle stays light.
// Heavy deps (jspdf, docx, templateContent ~808KB) only load when their route is visited.
const Template = lazy(() => import("./pages/Template.tsx"));
const Wizard = lazy(() => import("./pages/Wizard.tsx"));
const BuildContract = lazy(() => import("./pages/BuildContract.tsx"));
const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const Category = lazy(() => import("./pages/Category.tsx"));
const Sector = lazy(() => import("./pages/Sector.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const DocumentPage = lazy(() => import("./pages/Document.tsx"));
const UploadedContract = lazy(() => import("./pages/UploadedContract.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminAITraining = lazy(() => import("./pages/AdminAITraining.tsx"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Terms = lazy(() => import("./pages/legal/Terms.tsx"));
const Privacy = lazy(() => import("./pages/legal/Privacy.tsx"));
const Cookies = lazy(() => import("./pages/legal/Cookies.tsx"));
const Refund = lazy(() => import("./pages/legal/Refund.tsx"));
const Contacts = lazy(() => import("./pages/legal/Contacts.tsx"));
const ProviderInfo = lazy(() => import("./pages/legal/ProviderInfo.tsx"));
const WithdrawalForm = lazy(() => import("./pages/legal/WithdrawalForm.tsx"));
const DPA = lazy(() => import("./pages/legal/DPA.tsx"));
const SharedDocument = lazy(() => import("./pages/SharedDocument.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const BlogUserPost = lazy(() => import("./pages/BlogUserPost.tsx"));
const BlogSubmit = lazy(() => import("./pages/BlogSubmit.tsx"));
const Team = lazy(() => import("./pages/Team.tsx"));
const TeamAccept = lazy(() => import("./pages/TeamAccept.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const Downloads = lazy(() => import("./pages/Downloads.tsx"));
const SiteMap = lazy(() => import("./pages/SiteMap.tsx"));

// Defer Sentry boot until the browser is idle so it never competes with hydration / LCP.
if (typeof window !== "undefined") {
  const boot = () => import("@/lib/sentry").then((m) => m.initSentry());
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(boot, { timeout: 4000 });
  } else {
    setTimeout(boot, 2000);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
  </div>
);

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <AuthProvider>
          <PaymentTestModeBanner />
          <CookieBanner />
          <AIDisclaimerModal />
          <Suspense fallback={<RouteFallback />}>
            <AnimatedRoutes />
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
