import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { CookieBanner } from "@/components/CookieBanner";
import { initSentry } from "@/lib/sentry";

// Lazy-load every route except Index (landing page) so the initial bundle stays light.
// Heavy deps (jspdf, docx, templateContent ~808KB) only load when their route is visited.
const Template = lazy(() => import("./pages/Template.tsx"));
const Wizard = lazy(() => import("./pages/Wizard.tsx"));
const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const Category = lazy(() => import("./pages/Category.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const DocumentPage = lazy(() => import("./pages/Document.tsx"));
const UploadedContract = lazy(() => import("./pages/UploadedContract.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Terms = lazy(() => import("./pages/legal/Terms.tsx"));
const Privacy = lazy(() => import("./pages/legal/Privacy.tsx"));
const Cookies = lazy(() => import("./pages/legal/Cookies.tsx"));
const Refund = lazy(() => import("./pages/legal/Refund.tsx"));
const SharedDocument = lazy(() => import("./pages/SharedDocument.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const Team = lazy(() => import("./pages/Team.tsx"));
const TeamAccept = lazy(() => import("./pages/TeamAccept.tsx"));

initSentry();

const queryClient = new QueryClient();

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
      <BrowserRouter>
        <AuthProvider>
          <PaymentTestModeBanner />
          <CookieBanner />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/wizard/:sectorId" element={<Wizard />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/kategoria/:slug" element={<Category />} />
              <Route path="/shablon/:slug" element={<Template />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <Account />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/document/:id"
                element={
                  <ProtectedRoute>
                    <DocumentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/uploaded/:id"
                element={
                  <ProtectedRoute>
                    <UploadedContract />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/checkout/return" element={<CheckoutReturn />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/cookies" element={<Cookies />} />
              <Route path="/refund" element={<Refund />} />
              <Route path="/share/:token" element={<SharedDocument />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
              <Route path="/team/accept" element={<TeamAccept />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
