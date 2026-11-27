import { createContext, useCallback, useContext, useEffect, useState, ReactNode, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const OnboardingTour = lazy(() =>
  import("./OnboardingTour").then((m) => ({ default: m.OnboardingTour })),
);

interface Ctx {
  openTutorial: () => void;
}

const OnboardingContext = createContext<Ctx>({ openTutorial: () => {} });

export const useOnboarding = () => useContext(OnboardingContext);

const LS_KEY = "tutorial_seen_v1";

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);

  // Auto-trigger after first login.
  useEffect(() => {
    if (loading || autoChecked || !user) return;
    let cancelled = false;
    (async () => {
      const lsSeen = typeof window !== "undefined" && window.localStorage.getItem(LS_KEY);
      if (lsSeen) {
        setAutoChecked(true);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("tutorial_seen_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const seenAt = (data as { tutorial_seen_at?: string | null } | null)?.tutorial_seen_at;
      if (!seenAt) {
        // Defer slightly so it doesn't compete with login redirects/banners.
        setTimeout(() => !cancelled && setOpen(true), 800);
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_KEY, seenAt);
      }
      setAutoChecked(true);
    })();
    return () => { cancelled = true; };
  }, [user, loading, autoChecked]);

  const handleClose = useCallback(
    (markSeen?: boolean) => {
      setOpen(false);
      if (markSeen && user) {
        const now = new Date().toISOString();
        if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, now);
        supabase
          .from("profiles")
          .update({ tutorial_seen_at: now })
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) console.warn("tutorial_seen_at update failed", error);
          });
      }
    },
    [user],
  );

  const openTutorial = useCallback(() => setOpen(true), []);

  return (
    <OnboardingContext.Provider value={{ openTutorial }}>
      {children}
      <Suspense fallback={null}>
        {open && <OnboardingTour open={open} onClose={handleClose} />}
      </Suspense>
    </OnboardingContext.Provider>
  );
}
