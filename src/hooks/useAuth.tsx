import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
          // Only allow same-origin relative paths to prevent open-redirect attacks.
          const safeDest = dest && /^\/[^/\\]/.test(dest) ? dest : null;
          if (safeDest && safeDest !== window.location.pathname + window.location.search) {
            sessionStorage.removeItem("post_login_redirect");
            window.location.replace(safeDest);
          } else if (dest && !safeDest) {
            sessionStorage.removeItem("post_login_redirect");
          }
        } catch { /* ignore */ }
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
