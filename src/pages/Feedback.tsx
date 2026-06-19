import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bug, Lightbulb, FileQuestion, Layout, MessageSquarePlus, Star, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Category = "bug" | "idea" | "template_request" | "ui" | "other";

const CATEGORIES: { id: Category; label: string; icon: any; description: string; placeholder: string; subjectHint: string }[] = [
  { id: "bug", label: "Намерих бъг", icon: Bug, description: "Нещо не работи както трябва", subjectHint: "Кратко описание на проблема", placeholder: "Стъпки за възпроизвеждане:\n1. ...\n2. ...\n\nОчаквах: ...\nСе случи: ..." },
  { id: "idea", label: "Имам идея", icon: Lightbulb, description: "Подобрение или нова функция", subjectHint: "Заглавие на идеята", placeholder: "Какво искам да мога да правя и защо ще е полезно..." },
  { id: "template_request", label: "Липсващ шаблон", icon: FileQuestion, description: "Нужен ми е шаблон, който го няма", subjectHint: "Име на шаблона", placeholder: "Какъв документ ми трябва, в каква ситуация и за какъв сектор..." },
  { id: "ui", label: "UI/UX подобрение", icon: Layout, description: "Нещо е объркващо или неудобно", subjectHint: "Кратко описание", placeholder: "На коя страница, какво е объркващо, какво очаквах да видя..." },
  { id: "other", label: "Друго", icon: MessageSquarePlus, description: "Обратна връзка, въпрос или коментар", subjectHint: "Тема", placeholder: "Кажете ни..." },
];

const SOURCE_LABELS: Record<string, string> = {
  footer: "Footer",
  workspace: "Workspace",
  console: "Workspace",
  assistant: "DogovaryAI чат",
  hero: "Начална страница",
  settings: "Настройки на профил",
  "404": "Страница 404",
  template: "Страница на шаблон",
  kits: "Комплекти",
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const source = params.get("source") || "direct";
  const sourceLabel = SOURCE_LABELS[source] || source;
  const fromConsole = params.get("from") === "console" || source === "console" || source === "workspace";

  const [category, setCategory] = useState<Category>((params.get("category") as Category) || "idea");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const cat = useMemo(() => CATEGORIES.find((c) => c.id === category)!, [category]);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  useEffect(() => {
    // Reset placeholder when switching category
    if (!body) return;
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (subject.trim().length < 3) { toast.error("Моля въведете тема (поне 3 знака)"); return; }
    if (body.trim().length < 10) { toast.error("Моля опишете малко по-подробно (поне 10 знака)"); return; }
    setBusy(true);
    const { error } = await supabase.from("feedback_submissions").insert({
      user_id: user?.id ?? null,
      email: email || null,
      category,
      source_page: source,
      source_context: {
        source_label: sourceLabel,
        path_when_clicked: params.get("path") || null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
      subject: subject.trim(),
      body: body.trim(),
      rating,
    });
    setBusy(false);
    if (error) {
      toast.error("Грешка при изпращане", { description: error.message });
      return;
    }
    setDone(true);
    toast.success("Благодарим! Получихме обратната връзка.");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Seo
        title="Обратна връзка — Dogovori.net"
        description="Споделете идеи, докладвайте бъгове или поискайте нов шаблон. Четем всяка обратна връзка."
        canonical="https://dogovori.net/feedback"
        noindex
      />
      <Header />
      <main className="container max-w-3xl flex-1 py-10">
        {fromConsole && (
          <button
            onClick={() => navigate("/console")}
            className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Назад към Workspace
          </button>
        )}
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Обратна връзка</p>
          <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Помогнете ни да станем по-добри</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Четем всяко съобщение. Бъгове се обработват с приоритет, идеите се обсъждат с екипа.
          </p>
          {source !== "direct" && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold">
              От: {sourceLabel}
            </p>
          )}
        </div>

        {done ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-3 font-serif text-xl font-bold">Благодарим!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Получихме обратната Ви връзка. Ако оставихте имейл, ще ви потърсим при нужда.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Button asChild variant="outline"><Link to="/">Към началото</Link></Button>
              <Button onClick={() => { setDone(false); setSubject(""); setBody(""); setRating(null); }} className="bg-gradient-gold text-navy">
                Изпрати още
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 rounded-xl border border-border/60 bg-card/40 p-6">
            {/* Category cards */}
            <div>
              <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Категория</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={
                        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-xs transition-all " +
                        (active
                          ? "border-gold/60 bg-gold/10 text-foreground shadow-[0_0_0_1px_hsl(var(--gold)/0.3)]"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-gold/30 hover:text-foreground")
                      }
                    >
                      <Icon className={"h-4 w-4 " + (active ? "text-gold" : "text-muted-foreground")} />
                      <span className="font-semibold">{c.label}</span>
                      <span className="text-[10px] opacity-75">{c.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Тема</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={cat.subjectHint} maxLength={140} />
            </div>

            <div>
              <Label>Описание</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={cat.placeholder}
                rows={8}
                maxLength={4000}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">{body.length}/4000</p>
            </div>

            <div>
              <Label>Имейл за връзка (по желание)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional@example.com" />
            </div>

            <div>
              <Label className="mb-2 block">Колко доволни сте от платформата? (по желание)</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={
                      "rounded-md p-1.5 transition-colors " +
                      ((rating ?? 0) >= n ? "text-gold" : "text-muted-foreground/40 hover:text-gold/60")
                    }
                    aria-label={`${n} звезди`}
                  >
                    <Star className="h-5 w-5" fill={(rating ?? 0) >= n ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => navigate(-1)}>Отказ</Button>
              <Button onClick={submit} disabled={busy} className="bg-gradient-gold text-navy">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                Изпрати
              </Button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
