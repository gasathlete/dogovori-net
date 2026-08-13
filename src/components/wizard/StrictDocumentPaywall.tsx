import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles, Crown, Users, ShieldCheck } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { RoiSavingsBanner } from "@/components/funnel/RoiSavingsBanner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docKey: string;
  sectorId?: string;
  docName?: string;
  wizardHref: string;
}

export function StrictDocumentPaywall({
  open,
  onOpenChange,
  docKey,
  sectorId,
  docName,
  wizardHref,
}: Props) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const startUnlock = async () => {
    setStarting(true);
    trackEvent("strict_unlock_checkout_started", { doc_key: docKey, sector_id: sectorId });
    try {
      // Preserve wizard route so CheckoutReturn navigates back after payment.
      try {
        sessionStorage.setItem("wizard:resume", wizardHref);
      } catch {}
      const returnUrl = `${window.location.origin}/checkout/return?type=strict_unlock&session_id={CHECKOUT_SESSION_ID}`;
      const { data, error } = await supabase.functions.invoke("create-strict-unlock-checkout", {
        body: {
          doc_key: docKey,
          sector_id: sectorId,
          doc_name: docName,
          return_url: returnUrl,
          environment: getStripeEnvironment(),
        },
      });
      if (error || !data?.clientSecret) throw new Error(error?.message || "Не успяхме да отворим плащане");
      setClientSecret(data.clientSecret);
    } catch (e: any) {
      toast.error("Грешка", { description: String(e?.message ?? e) });
    } finally {
      setStarting(false);
    }
  };

  const goPlans = () => {
    onOpenChange(false);
    navigate(`/plans?redirect=${encodeURIComponent(wizardHref)}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setClientSecret(null); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        {clientSecret ? (
          <div>
            <DialogHeader className="mb-3">
              <DialogTitle>Отключване на Стриктен документ — 0,40 €</DialogTitle>
              <DialogDescription>
                Плащането е сигурно. След успех се връщате към документа за сваляне.
              </DialogDescription>
            </DialogHeader>
            <div id="strict-checkout" className="min-h-[500px]">
              <EmbeddedCheckoutProvider
                stripe={getStripe()}
                options={{ fetchClientSecret: async () => clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold w-fit mb-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Стриктен документ
              </div>
              <DialogTitle className="text-2xl">Вие създадохте Стриктен документ</DialogTitle>
              <DialogDescription className="text-base pt-2">
                Dogovori.net поддържа стриктните документи за платени потребители.
                За да го изтеглите, преминете към Професионалист/Предприемач или
                закупете еднократно отключване.
              </DialogDescription>
            </DialogHeader>

            <RoiSavingsBanner className="mt-3" />


            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <div className="rounded-xl border border-border p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-4 w-4 text-gold" />
                  <div className="font-semibold">Предприемач</div>
                </div>
                <div className="text-2xl font-bold mb-1">12,90 €<span className="text-sm font-normal text-muted-foreground">/мес</span></div>
                <ul className="text-xs text-muted-foreground space-y-1 mb-3 flex-1">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />100 операции/месец</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />Всички Стриктни документи</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />AI асистент & анализ</li>
                </ul>
                <Button variant="default" size="sm" className="w-full" onClick={goPlans}>
                  Виж планове
                </Button>
              </div>

              <div className="rounded-xl border border-border p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-gold" />
                  <div className="font-semibold">Екип</div>
                </div>
                <div className="text-2xl font-bold mb-1">от 32,70 €<span className="text-sm font-normal text-muted-foreground">/мес</span></div>
                <ul className="text-xs text-muted-foreground space-y-1 mb-3 flex-1">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />От 3 места нагоре</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />100 операции/място/месец</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />Споделени папки & подпис</li>
                </ul>
                <Button variant="outline" size="sm" className="w-full" onClick={goPlans}>
                  Виж планове
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-2 border-gold/50 bg-gold/5 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <div className="font-semibold">Отключи само този документ</div>
                </div>
                <div className="text-xl font-bold text-gold">0,40 €</div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Еднократно плащане. Валидно 24 часа за този документ — сваляте
                неограничен брой пъти в PDF и DOCX.
              </p>
              <Button
                onClick={startUnlock}
                disabled={starting}
                className="w-full gap-2 bg-gradient-to-r from-gold to-gold-dark hover:opacity-90"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Отключи за 0,40 €
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Прогресът ви е запазен и ще ви върнем към документа след плащане.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
