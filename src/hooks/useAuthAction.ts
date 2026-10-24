import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/** One in-flight auth request per form, including same-tick submissions. */
export function useAuthAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try { await action(); }
    catch { toast.error("Няма връзка със сървъра. Опитайте отново."); }
    finally { locked.current = false; setBusy(false); }
  }, []);
  return { busy, run };
}