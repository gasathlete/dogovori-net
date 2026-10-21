import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BonusOffer, MARKETING_BONUS_EVENT, MARKETING_BONUS_VERSION, refreshBonusBalance } from "@/lib/marketingBonus";
import { entryPackCheckoutTarget } from "@/lib/entryPack";

export function MarketingBonusDialog() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<BonusOffer[]>([]);
  const queue = useRef<BonusOffer[]>([]);
  const [checked, setChecked] = useState(false);
  const [verifiedOffer, setVerifiedOffer] = useState<BonusOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const eventId = useRef(crypto.randomUUID());
  const active = offers[0];
  const finish = (proceed: boolean, expected?: BonusOffer) => {
    if (expected && queue.current[0] !== expected) return;
    const [offer, ...remaining] = queue.current;
    queue.current = remaining;
    setOffers(remaining);
    setChecked(false);
    setVerifiedOffer(null);
    setError("");
    eventId.current = crypto.randomUUID();
    offer?.resolve(proceed);
  };
  useEffect(() => {
    const onOffer = (event: Event) => {
      const offer = (event as CustomEvent<BonusOffer>).detail;
      if (!user || offer.userId !== user.id) { offer.resolve(false); return; }
      queue.current = [...queue.current, offer];
      setOffers(queue.current);
    };
    window.addEventListener(MARKETING_BONUS_EVENT, onOffer);
    return () => {
      window.removeEventListener(MARKETING_BONUS_EVENT, onOffer);
      queue.current.forEach((offer) => offer.resolve(false));
      queue.current = [];
      setOffers([]);
      setChecked(false);
    };
  }, [user?.id]);
  // Recheck queued offers: another tab/signup may already have claimed it.
  useEffect(() => {
    if (!active) return;
    let current = true;
    void Promise.resolve(supabase.rpc("marketing_bonus_status")).then(({ data, error: failure }) => {
      if (!current) return;
      if (failure || (data as { eligible?: boolean } | null)?.eligible !== true) finish(false, active);
      else setVerifiedOffer(active);
    }).catch(() => { if (current) finish(false, active); });
    return () => { current = false; };
  }, [active]);
  const claim = async () => {
    if (!checked || !active || verifiedOffer !== active || busyRef.current || user?.id !== active.userId) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { data, error: failure } = await supabase.rpc("claim_marketing_bonus", {
        _accept: true, _event_id: eventId.current, _version: MARKETING_BONUS_VERSION,
      });
      if (failure || (data as { ok?: boolean } | null)?.ok !== true) {
        setError("Бонусът не е потвърден. Опитайте отново; въведените данни остават тук.");
        return;
      }
      await refreshBonusBalance(active.userId);
      finish(true, active);
    } catch {
      setError("Няма потвърждение от сървъра. Опитайте отново.");
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open={!!active && user?.id === active.userId} onOpenChange={(open) => { if (!open && !busyRef.current) finish(false); }}>
    <DialogContent onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Недостатъчно операции</DialogTitle>
        <DialogDescription>Можете еднократно да получите още {active?.bonusOps} операции със съгласие за имейл маркетинг. Регистрацията и платените възможности не изискват това съгласие.</DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-3">
        <Checkbox id="marketing-bonus-consent" checked={checked} disabled={busy || verifiedOffer !== active} onCheckedChange={(value) => setChecked(value === true)} />
        <Label htmlFor="marketing-bonus-consent" className="leading-relaxed">Искам да получавам имейл съобщения за новости, бонуси и награди. Мога да оттегля съгласието от профила си, без да загубя получените операции.</Label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={!checked || busy || verifiedOffer !== active} onClick={() => { void claim(); }}>Получете бонуса и продължете</Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => finish(false)}>Не сега</Button>
        <Button variant="outline" asChild disabled={busy}><Link to="/plans" onClick={(event) => { if (busyRef.current) event.preventDefault(); else finish(false); }}>Платени планове</Link></Button>
        <Button variant="ghost" asChild disabled={busy}><Link to={entryPackCheckoutTarget()} onClick={(event) => { if (busyRef.current) event.preventDefault(); else finish(false); }}>Еднократен пакет</Link></Button>
      </div>
    </DialogContent>
  </Dialog>;
}