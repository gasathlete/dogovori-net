import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/icons";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; client_name?: string; redirect_uris?: string[] };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
};
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const SCOPE_LABELS: Record<string, string> = {
  openid: "Провери самоличността ти",
  email: "Виж твоя имейл адрес",
  profile: "Виж основния ти профил",
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Липсва authorization_id в URL адреса.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the full consent URL so the auth flow returns the user here.
        const next = window.location.pathname + window.location.search;
        window.location.replace("/auth?redirect=" + encodeURIComponent(next));
        return;
      }
      setAccount(sess.session.user.email ?? sess.session.user.id);
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Сървърът не върна redirect URL.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "външно приложение";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-soft">
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Свържи {clientName} с акаунта си
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Това ще позволи на <strong className="text-foreground">{clientName}</strong> да използва
          Dogovori.net от твое име.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!details && !error && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Зареждане…
          </div>
        )}

        {details && (
          <>
            {account && (
              <p className="mt-4 text-xs text-muted-foreground">
                Влезли сте като <strong className="text-foreground">{account}</strong>
              </p>
            )}

            {scopes.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Достъп
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {scopes.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <span>{SCOPE_LABELS[s] ?? `Допълнително разрешение: ${s}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Достъпът до документите ти остава защитен от правилата за сигурност на Dogovori.net.
              Външното приложение вижда само данни, до които ти самият имаш достъп.
            </p>

            <div className="mt-6 flex gap-2">
              <Button
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 bg-gradient-gold text-navy hover:shadow-gold"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Разреши
              </Button>
              <Button
                onClick={() => decide(false)}
                disabled={busy}
                variant="outline"
                className="flex-1"
              >
                Откажи
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
