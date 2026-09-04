import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { clearAllDraftStorage, readPointer } from "@/lib/activationDraft";
import { isAuthLandingPath, resolvePostAuthRedirect } from "@/lib/postAuthRedirect";
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
  /** Пренасочването след вход се обработва точно веднъж на зареждане. */
  const redirectHandledRef = useRef(false);

  useEffect(() => {
    /**
     * След OAuth връщане към голия origin — или при вече влязъл потребител,
     * чиято сесия идва от `getSession` — честим целта, зададена на страницата
     * за вход (каталог, шаблон, уизард…). Изпълнява се веднъж, за да не се
     * получи цикъл или двойно обработване.
     */
    const applyPostAuthRedirect = () => {
      if (redirectHandledRef.current || typeof window === "undefined") return;
      redirectHandledRef.current = true;
      try {
        const destination = sessionStorage.getItem("post_login_redirect");
        // Резервният маршрут на чернова важи само при кацане след вход — иначе
        // презареждане на /plans или /account би „отвлякло" потребителя.
        const isAuthLanding = isAuthLandingPath(window.location.pathname);
        const draft = destination === null && isAuthLanding ? readPointer() : null;
        const decision = resolvePostAuthRedirect({
          destination,
          here: window.location.pathname + window.location.search,
          draftRoute: draft ? sanitizeReturnPath(draft.route) : null,
          isAuthLanding,
        });
        if (decision.consumeDestination) sessionStorage.removeItem("post_login_redirect");
        if (decision.target) window.location.replace(decision.target);
      } catch { /* ignore */ }

    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (event === "SIGNED_IN" && s) applyPostAuthRedirect();

      // При изход нищо от започнатия документ не остава в браузъра: указателят
      // е безполезен без сесия, а съдържанието в таба не бива да се вижда от
      // следващия потребител на същото устройство.
      if (event === "SIGNED_OUT") {
        redirectHandledRef.current = false;
        try { clearAllDraftStorage(); } catch { /* ignore */ }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // Същото правило и когато сесията вече е налична при зареждане —
      // потребителят не бива да остава на празен екран с „залепнала" цел.
      if (data.session) applyPostAuthRedirect();
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
