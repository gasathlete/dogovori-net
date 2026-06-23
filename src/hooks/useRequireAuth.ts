import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AUTH_GATE_EVENT, type AuthGateDetail } from "@/components/AuthGateModal";

/**
 * Gate any "operation" (download, upload, AI send, e-sign, …) behind login.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   const onClick = () => {
 *     if (!requireAuth({ action: "Изтегли бланка" })) return;
 *     runDownload();
 *   };
 *
 * Returns `true` when the user is authenticated (caller may proceed).
 * Otherwise opens the global AuthGateModal and returns `false`.
 */
export function useRequireAuth() {
  const { user } = useAuth();
  return useCallback(
    (detail?: AuthGateDetail) => {
      if (user) return true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_GATE_EVENT, { detail: detail ?? {} }));
      }
      return false;
    },
    [user],
  );
}
