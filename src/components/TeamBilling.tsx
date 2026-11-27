import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CreditCard, ExternalLink, FileText, Loader2 } from "@/icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type Subscription = {
  id: string;
  status: string;
  quantity: number;
  unit_amount: number;
  currency: string;
  interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Активен", variant: "default" },
  trialing: { label: "Тестов период", variant: "secondary" },
  past_due: { label: "Просрочен", variant: "destructive" },
  canceled: { label: "Отказан", variant: "outline" },
  incomplete: { label: "Незавършен", variant: "outline" },
  paused: { label: "Спрян", variant: "outline" },
};

function fmtCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("bg-BG", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch { return `${amount.toFixed(2)} ${currency.toUpperCase()}`; }
}

export function TeamBilling({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("team-billing-data", {
          body: { teamId, environment: getStripeEnvironment() },
        });
        if (error) throw new Error(error.message);
        setSubscription(data?.subscription ?? null);
        setInvoices(data?.invoices ?? []);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [teamId]);

  async function openPortal() {
    setPortalBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: {
          teamId,
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/team`,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error(data?.error || "Не успяхме да отворим портала");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { toast.error(e.message); }
    finally { setPortalBusy(false); }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const status = subscription?.status ?? "unknown";
  const statusInfo = STATUS_LABEL[status] ?? { label: status, variant: "outline" as const };
  const total = subscription ? subscription.unit_amount * subscription.quantity : 0;
  const intervalLabel = subscription?.interval === "year" ? "годишно" : subscription?.interval === "month" ? "месечно" : "";

  return (
    <div className="space-y-4">
      {status === "past_due" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Просрочено плащане</AlertTitle>
          <AlertDescription>
            Последното плащане не премина. Stripe ще повтори опита автоматично. Актуализирайте платежния си метод в портала, за да избегнете прекъсване.
          </AlertDescription>
        </Alert>
      )}
      {status === "canceled" && subscription?.current_period_end && new Date(subscription.current_period_end) > new Date() && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Абонаментът е отказан</AlertTitle>
          <AlertDescription>
            Имате достъп до {new Date(subscription.current_period_end).toLocaleDateString("bg-BG")}. След това екипът ще бъде деактивиран.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
              <CreditCard className="h-4 w-4" /> Абонамент
            </div>
            <h3 className="mt-1 font-serif text-xl font-bold">План Екип</h3>
            {subscription ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {subscription.quantity} × {fmtCurrency(subscription.unit_amount, subscription.currency)} = <strong>{fmtCurrency(total, subscription.currency)}</strong> {intervalLabel}
                {subscription.current_period_end && (
                  <> · Подновяване: {new Date(subscription.current_period_end).toLocaleDateString("bg-BG")}</>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Няма активен абонамент в Stripe</p>
            )}
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={openPortal} disabled={portalBusy} className="bg-gradient-gold text-navy">
              {portalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Управление в Stripe
            </Button>
            <Button variant="outline" onClick={openPortal} disabled={portalBusy}>
              Отмени абонамент
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
        <h3 className="mb-4 font-serif text-lg font-bold">Последни фактури</h3>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Все още няма фактури</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{inv.number || inv.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.created ? new Date(inv.created).toLocaleDateString("bg-BG") : ""} · {inv.status ?? ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{fmtCurrency(inv.amount_paid, inv.currency)}</span>
                  {inv.hosted_invoice_url && (
                    <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {inv.pdf_url && (
                    <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                      <FileText className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
