import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { recordConsents } from "@/lib/consents";
import {
  DISCLAIMER_BODY,
  DISCLAIMER_LIMITS,
  DISCLAIMER_VERSION,
  hasFeatureDisclaimer,
  type DisclaimerFeature,
  type DisclaimerRequestDetail,
} from "@/lib/aiDisclaimerGate";
import { drainBufferedEvents } from "@/lib/bufferedEvents";
import { getOpSessionId } from "@/lib/opSession";
import { supabase } from "@/integrations/supabase/client";

function reply(id: string, accepted: boolean) {
  window.dispatchEvent(new CustomEvent("ai-disclaimer:resolved", { detail: { id, accepted } }));
}

/**
 * Global pre-start disclaimer. Explicit, not pre-checked acceptance.
 * Accept → original action continues; cancel → action stops, no backend call.
 */
export function AIDisclaimerModal() {
  // Sequential queue: concurrent requests for different features are shown one
  // after another; none is overwritten or left pending.
  const [queue, setQueue] = useState<DisclaimerRequestDetail[]>([]);
  const req = queue[0] ?? null;
  const [checked, setChecked] = useState(false);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    const onRequest = (raw: unknown) => {
      const d = raw as DisclaimerRequestDetail | undefined;
      if (!d?.id || !d.feature || handled.current.has(d.id)) return;
      handled.current.add(d.id);
      if (hasFeatureDisclaimer(d.feature)) {
        reply(d.id, true);
        return;
      }
      setQueue((q) => [...q, d]);
    };
    const listener = (e: Event) => onRequest((e as CustomEvent).detail);
    window.addEventListener("ai-disclaimer:request", listener);
    drainBufferedEvents("ai-disclaimer:request", onRequest);
    return () => window.removeEventListener("ai-disclaimer:request", listener);
  }, []);

  const accept = useCallback(() => {
    if (!req || !checked) return;
    const feature: DisclaimerFeature = req.feature;
    reply(req.id, true);
    setChecked(false);
    setQueue((q) => q.slice(1));
    // Audit only for signed-in users; minimal metadata, no document content.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      return recordConsents([{
        consent_type: "ai_disclaimer",
        granted: true,
        metadata: { feature, disclaimer_version: DISCLAIMER_VERSION, session_id: getOpSessionId() },
      }]);
    }).catch(() => undefined);
  }, [req, checked]);

  const cancel = useCallback(() => {
    if (!req) return;
    reply(req.id, false);
    setChecked(false);
    setQueue((q) => q.slice(1));
  }, [req]);

  const info = req ? DISCLAIMER_LIMITS[req.feature] : null;

  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle>{info.title}</DialogTitle>
              <DialogDescription className="text-foreground/90">{DISCLAIMER_BODY}</DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {info.limits.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                aria-label="Прочетох и разбирам горната информация"
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                Прочетох и разбирам горната информация и{" "}
                <Link to="/terms" target="_blank" className="underline underline-offset-2">Условията</Link>.
              </span>
            </label>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="min-h-11" onClick={cancel}>Отказ</Button>
              <Button type="button" className="min-h-11" disabled={!checked} onClick={accept}>
                Разбрах и продължавам
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
