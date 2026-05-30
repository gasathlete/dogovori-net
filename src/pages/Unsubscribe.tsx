import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "ready" | "done" | "already" | "invalid" | "submitting" | "error">("loading");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: ANON },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("ready");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (d.success) setState("done");
      else if (d.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <Card className="w-full max-w-md border-gold/20">
        <CardHeader>
          <CardTitle className="text-center">Отписване от имейли</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state === "loading" && (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          )}
          {state === "ready" && (
            <>
              <p className="text-muted-foreground">Натиснете бутона, за да потвърдите отписването от имейли от dogovori.net.</p>
              <Button onClick={confirm} className="w-full">Потвърди отписването</Button>
            </>
          )}
          {state === "submitting" && (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="h-10 w-10 text-gold mx-auto" />
              <p>Отписани сте успешно. Повече няма да получавате нашите имейли.</p>
              <Button asChild variant="outline"><Link to="/">Към dogovori.net</Link></Button>
            </>
          )}
          {state === "already" && (
            <>
              <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Вече сте отписани.</p>
              <Button asChild variant="outline"><Link to="/">Към dogovori.net</Link></Button>
            </>
          )}
          {(state === "invalid" || state === "error") && (
            <>
              <XCircle className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-muted-foreground">
                {state === "invalid" ? "Линкът е невалиден или е изтекъл." : "Възникна грешка. Опитайте отново."}
              </p>
              <Button asChild variant="outline"><Link to="/">Към dogovori.net</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
