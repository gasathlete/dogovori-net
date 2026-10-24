import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleConsentDialog } from "./GoogleConsentDialog";
import { recordConsents } from "@/lib/consents";
import { useAuthAction } from "@/hooks/useAuthAction";
import { toast } from "sonner";
import { safeReturnPath } from "@/lib/safeRoute";

/** Fresh choices after the provider identifies the account; never replay another person's pre-login choices. */
export function ConfirmedConsentDialog() {
  const [open, setOpen] = useState(false);
  const { busy, run } = useAuthAction();
  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener("dogovori:confirm-account-consent", listener);
    return () => window.removeEventListener("dogovori:confirm-account-consent", listener);
  }, []);
  const confirm = async (marketing: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const result = await recordConsents([
      { consent_type: "terms", granted: true }, { consent_type: "privacy", granted: true },
      { consent_type: "age_18", granted: true }, { consent_type: "operational_notifications", granted: true },
      ...(marketing ? [{ consent_type: "marketing" as const, granted: true }] : []),
    ]);
    if (!result.ok) { toast.error("Изборът Ви не е записан. Опитайте отново."); return; }
    setOpen(false);
    try {
      const target = safeReturnPath(sessionStorage.getItem("post_login_redirect"), "/account");
      sessionStorage.removeItem("post_login_redirect"); sessionStorage.removeItem("post_login_redirect_fallback");
      window.location.replace(target);
    } catch { /* no storage: stay on the current authenticated page */ }
  };
  return <GoogleConsentDialog open={open} onOpenChange={setOpen} busy={busy} onConfirm={choice => { void run(() => confirm(choice)); }} authenticated />;
}