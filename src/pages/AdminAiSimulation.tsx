import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Sparkles } from "@/icons";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";

// Each tab is a separate lazy chunk — only the active tab's code is fetched.
// Cuts the admin entry chunk by ~75% and makes initial tab paint instant.
const RunTab = lazy(() => import("./adminAiSimulation/RunTab"));
const HistoryTab = lazy(() => import("./adminAiSimulation/HistoryTab"));
const PatchesTab = lazy(() => import("./adminAiSimulation/PatchesTab"));
const ScenariosTab = lazy(() => import("./adminAiSimulation/ScenariosTab"));
const SettingsTab = lazy(() => import("./adminAiSimulation/SettingsTab"));

const TABS = [
  { value: "run", label: "Нова симулация", load: () => import("./adminAiSimulation/RunTab") },
  { value: "history", label: "История", load: () => import("./adminAiSimulation/HistoryTab") },
  { value: "patches", label: "Patch-ове", load: () => import("./adminAiSimulation/PatchesTab") },
  { value: "scenarios", label: "Сценарии", load: () => import("./adminAiSimulation/ScenariosTab") },
  { value: "settings", label: "Настройки & Cost", load: () => import("./adminAiSimulation/SettingsTab") },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const TabFallback = () => (
  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" /> Зареждане...
  </div>
);

export default function AdminAiSimulation() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabValue>("run");

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  // Hover-prefetch on tab triggers so switching feels instant.
  const prefetch = (value: TabValue) => {
    const t = TABS.find((x) => x.value === value);
    if (t) void t.load();
  };

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh">
        <Header />
        <div className="container py-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
                <Sparkles className="h-6 w-6 text-gold" /> AI симулация — самообучение на DogovaryAI
              </h1>
              <p className="text-sm text-muted-foreground">
                Адвокат-AI задава въпроси на DogovaryAI, оценява отговорите и предлага автоматични патчове за активния промпт.
              </p>
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-3 w-3" /> Към админ</Link></Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  onMouseEnter={() => prefetch(t.value)}
                  onFocus={() => prefetch(t.value)}
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Mount only the active tab → its chunk is fetched on demand. */}
            <Suspense fallback={<TabFallback />}>
              {tab === "run" && <TabsContent value="run" forceMount><RunTab /></TabsContent>}
              {tab === "history" && <TabsContent value="history" forceMount><HistoryTab /></TabsContent>}
              {tab === "patches" && <TabsContent value="patches" forceMount><PatchesTab /></TabsContent>}
              {tab === "scenarios" && <TabsContent value="scenarios" forceMount><ScenariosTab /></TabsContent>}
              {tab === "settings" && <TabsContent value="settings" forceMount><SettingsTab /></TabsContent>}
            </Suspense>
          </Tabs>
        </div>
      </div>
    </AdminMFAGuard>
  );
}
