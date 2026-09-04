import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clearAllDraftStorage, readPointer } from "@/lib/activationDraft";
import { sanitizeReturnPath } from "@/lib/safeRoute";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      // After OAuth provider redirects back to the bare origin, honour the
      // post-login destination set on the Auth page (catalog, template page,
      // wizard, etc.). Only run once per sign-in to avoid loops.
      if (event === "SIGNED_IN" && typeof window !== "undefined") {
        try {
          const dest = sessionStorage.getItem("post_login_redirect");
          // Само относителен път в същия origin — иначе open redirect след вход.
          const safeDest = sanitizeReturnPath(dest);
          const here = window.location.pathname + window.location.search;
          if (safeDest && safeDest !== here) {
            sessionStorage.removeItem("post_login_redirect");
            window.location.replace(safeDest);
          } else if (dest && !safeDest) {
            sessionStorage.removeItem("post_login_redirect");
          } else if (!dest) {
            // Няма изрична цел (нов таб от имейл линк, OAuth към голия origin):
            // ако има недовършен документ, връщаме потребителя точно при него
            // вместо в празен акаунт.
            const draft = readPointer();
            const draftRoute = draft ? sanitizeReturnPath(draft.route) : null;
            if (draftRoute && draftRoute !== here) window.location.replace(draftRoute);
          }
        } catch { /* ignore */ }
      }

      // При изход нищо от започнатия документ не остава в браузъра: указателят
      // е безполезен без сесия, а съдържанието в таба не бива да се вижда от
      // следващия потребител на същото устройство.
      if (event === "SIGNED_OUT") {
        try { clearAllDraftStorage(); } catch { /* ignore */ }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
