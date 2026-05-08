import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container max-w-md py-20 text-center">
        <div className="rounded-2xl border border-gold/30 bg-gradient-card p-10">
          <CheckCircle2 className="mx-auto h-12 w-12 text-gold" />
          <h1 className="mt-4 font-serif text-2xl font-bold">Благодарим Ви!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {sessionId
              ? "Плащането е получено. Pro планът ще бъде активиран до минута."
              : "Няма информация за плащане."}
          </p>
          <Button asChild className="mt-6 bg-gradient-gold text-navy hover:shadow-gold">
            <Link to="/account">Към профила</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
