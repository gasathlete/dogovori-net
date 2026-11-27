import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { clearAllDraftStorage, readPointer } from "@/lib/activationDraft";
import { clearAssistantDocumentContext } from "@/lib/assistantDocumentContext";
import { isAuthLandingPath, resolvePostAuthRedirect } from "@/lib/postAuthRedirect";
import { settleAccountConsent, flushPendingConsents } from "@/lib/consents";
import { sanitizeReturnPath } from "@/lib/safeRoute";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { observeRecovery } from "@/lib/passwordRecovery";
import { ConfirmedConsentDialog } from "@/components/auth/ConfirmedConsentDialog";

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
  /** Последният видян потребител — само в паметта, за изчистване при смяна. */
  const lastUserIdRef = useRef<string | null>(null);

  /**
   * Изборът на документ за DogovaryAI е строго за текущата сесия: при изход или
   * смяна на акаунт (включително повторен вход в СЪЩИЯ акаунт) той се изчиства
   * безусловно, за да не може заглавие или ID от предишната сесия да се появи.
   */
  const syncAssistantContextOwner = (nextUserId: string | null) => {
    const prev = lastUserIdRef.current;
    if (prev !== nextUserId) {
      if (prev !== null) clearAssistantDocumentContext();
      lastUserIdRef.current = nextUserId;
    }
  };

  useEffect(() => {
    /**
     * След OAuth връщане към голия origin — или при вече влязъл потребител,
     * чиято сесия идва от `getSession` — честим целта, зададена на страницата
     * за вход (каталог, шаблон, уизард…). Изпълнява се веднъж, за да не се
     * получи цикъл или двойно обработване.
     */
    const applyPostAuthRedirect = () => {
      if (redirectHandledRef.current || typeof window === "undefined") return;
      // A recovery session must stay on the password form, even with a stale product intent.
      if (window.location.pathname.replace(/\/$/, "") === "/reset-password") return;
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
        if (decision.consumeDestination) { sessionStorage.removeItem("post_login_redirect"); sessionStorage.removeItem("post_login_redirect_fallback"); }
        if (decision.target) window.location.replace(decision.target);
      } catch { /* ignore */ }

    };

    let pendingConsentUser: string | null = null;
    let flushingUser: string | null = null;
    const finishSignIn = (userId: string) => {
      // getSession and SIGNED_IN can report the same OAuth session. A second
      // flush must not consume the redirect while its consent dialog is open.
      if (pendingConsentUser === userId || flushingUser === userId) return;
      flushingUser = userId;
      void flushPendingConsents().then(result => {
        if (flushingUser !== userId) return;
        if (result?.reason === "authenticated-choice-required") pendingConsentUser = userId;
        else { settleAccountConsent(true); applyPostAuthRedirect(); }
      }).catch(() => undefined).finally(() => {
        if (flushingUser === userId) flushingUser = null;
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      observeRecovery(event, s?.user.id);
      setSession(s);
      setLoading(false);
      if (event === "SIGNED_IN" && s) {
        // Leave the auth callback before awaiting SDK calls. Flush explicit
        // signup evidence before navigation so a reload cannot lose the grant.
        setTimeout(() => {
          finishSignIn(s.user.id);
        }, 0);
      }

      // При изход нищо от започнатия документ не остава в браузъра: указателят
      // е безполезен без сесия, а съдържанието в таба не бива да се вижда от
      // следващия потребител на същото устройство.
      if (event === "SIGNED_OUT") {
        pendingConsentUser = null;
        flushingUser = null;
        redirectHandledRef.current = false;
        lastUserIdRef.current = null;
        try { clearAssistantDocumentContext(); } catch { /* ignore */ }
        try { clearAllDraftStorage(); } catch { /* ignore */ }
        return;
      }
      // Обновяване на токена за същия акаунт НЕ изчиства избрания документ.
      syncAssistantContextOwner(s?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      syncAssistantContextOwner(data.session?.user?.id ?? null);
      // Същото правило и когато сесията вече е налична при зареждане —
      // потребителят не бива да остава на празен екран с „залепнала" цел.
      if (data.session) finishSignIn(data.session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
      <ConfirmedConsentDialog />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
