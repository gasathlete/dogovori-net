// Author-facing status screen for submitted homepage reviews:
// shows whether a review is awaiting moderation, published or rejected.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Loader2, Star, Clock, CheckCircle2, AlertCircle, BadgeCheck, MessageSquarePlus } from "@/icons";

const BUCKET = "home-testimonials";

type Row = {
  id: string;
  name: string;
  role: string | null;
  about: string | null;
  quote: string;
  rating: number;
  photo_url: string;
  is_approved: boolean;
  is_verified_customer: boolean;
  order_ref: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${n} от 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < n ? "h-4 w-4 fill-gold text-gold" : "h-4 w-4 text-muted-foreground/40"}
          strokeWidth={i < n ? 0 : 1.5}
        />
      ))}
    </div>
  );
}

function StatusBadge({ r }: { r: Row }) {
  if (r.is_approved) {
    return (
      <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" /> Публикувано
      </Badge>
    );
  }
  if (r.rejection_reason) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        <AlertCircle className="mr-1 h-3.5 w-3.5" /> Отказано
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-gold/40 text-gold">
      <Clock className="mr-1 h-3.5 w-3.5" /> Чака одобрение
    </Badge>
  );
}

export default function MyReviewsPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [srcs, setSrcs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("home_testimonials")
        .select("id,name,role,about,quote,rating,photo_url,is_approved,is_verified_customer,order_ref,rejection_reason,reviewed_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = (data as Row[]) ?? [];
      setRows(list);
      const map: Record<string, string> = {};
      await Promise.all(
        list.map(async (r) => {
          if (/^https?:\/\//i.test(r.photo_url)) {
            map[r.id] = r.photo_url;
            return;
          }
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(r.photo_url, 3600);
          map[r.id] = s?.signedUrl ?? "";
        }),
      );
      if (!cancelled) setSrcs(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-background">
        <Header />
        <main className="container py-20 text-center">
          <h1 className="mb-3 font-serif text-2xl font-bold">Моите ревюта</h1>
          <p className="mb-6 text-muted-foreground">Влезте в профила си, за да видите статуса на вашите ревюта.</p>
          <Button asChild>
            <Link to="/auth">Вход</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="container py-8 md:py-12">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/#testimonials">
            <ArrowLeft className="mr-1 h-4 w-4" /> Към мненията
          </Link>
        </Button>

        <h1 className="font-serif text-2xl font-bold md:text-3xl">Моите ревюта</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Всяко ревю преминава кратка модерация от екипа, преди да се публикува на началната страница. Обикновено
          прегледът отнема до 48 часа.
        </p>

        {rows === null ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-8 rounded-xl border border-hairline bg-card p-8 text-center">
            <MessageSquarePlus className="mx-auto mb-3 h-8 w-8 text-gold" />
            <p className="mb-4 text-sm text-muted-foreground">Все още не сте изпращали ревю.</p>
            <Button asChild variant="outline">
              <Link to="/#testimonials">Напишете ревю</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <article key={r.id} className="rounded-xl border border-hairline bg-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  {srcs[r.id] ? (
                    <img src={srcs[r.id]} alt={r.name} className="h-14 w-14 rounded-full border border-hairline object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full border border-hairline bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <StatusBadge r={r} />
                      {r.is_verified_customer && (
                        <Badge variant="secondary" className="border-gold/30 bg-gold/10 text-gold">
                          <BadgeCheck className="mr-1 h-3.5 w-3.5 text-success" /> Проверен клиент
                        </Badge>
                      )}
                    </div>
                    {r.role && <div className="text-xs text-muted-foreground">{r.role}</div>}
                    <div className="mt-1">
                      <Stars n={r.rating} />
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-relaxed">„{r.quote}"</p>

                {r.rejection_reason && (
                  <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive">
                    Причина за отказа: {r.rejection_reason}
                  </p>
                )}

                {!r.is_approved && !r.rejection_reason && (
                  <p className="mt-3 rounded-lg border border-gold/25 bg-gold/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
                    Ревюто е получено и чака одобрение. Ще се появи автоматично на началната страница, след като екипът
                    го прегледа.
                  </p>
                )}

                {r.order_ref && (
                  <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Референция: {r.order_ref}
                  </p>
                )}

                <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Изпратено: {new Date(r.created_at).toLocaleString("bg-BG")}
                  {r.reviewed_at && ` · Прегледано: ${new Date(r.reviewed_at).toLocaleString("bg-BG")}`}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
