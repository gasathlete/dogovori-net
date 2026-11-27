/**
 * FreeWelcomeDialog — Стълб 1 ("Value-first onboarding").
 *
 * Shown exactly once per authenticated free user (per device) on their first
 * navigation after signup. Communicates the 5-ops signup bonus and previews
 * the paid pillars without any urgency copy.
 */
import { useEffect, useState } from "react";
import { FREE_OFFER_RULE } from "@/lib/pricing";
import { Link, useLocation } from "react-router-dom";
import { isWelcomeSuppressedPath } from "@/lib/welcomeSuppression";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Languages,
  PenTool,
  Layers,
  Wrench,
  ArrowRight,
} from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { trackEvent } from "@/lib/analytics";
import { CATALOG_DOCUMENT_COUNT } from "@/lib/catalogStats";

const STORAGE_KEY_PREFIX = "dgv:free-welcome:v1:";

const PILLARS = [
  { icon: MessageSquare, title: "AI Асистент", desc: `Правен чат с достъп до ${CATALOG_DOCUMENT_COUNT} шаблона.` },
  { icon: ShieldCheck, title: "Проверка на качен документ", desc: "Анализ на текста с цитати от самия документ." },
  { icon: Languages, title: "Двуезични договори", desc: "Паралелен EN превод с правна терминология." },
  { icon: PenTool, title: "e-Подпис", desc: "Изпрати за подпис с проследяване." },
  { icon: Layers, title: "Комплекти документи", desc: "Обединени пакети + автоматични напомняния." },
  { icon: Wrench, title: "Повече действия всеки месец", desc: "Лимитът на плана е описан на страницата „Планове“." },
];

export function FreeWelcomeDialog() {
  const { user } = useAuth();
  const { isPro, loading } = useIsPro();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const suppressed = isWelcomeSuppressedPath(pathname);

  useEffect(() => {
    if (suppressed) { setOpen(false); return; }
    if (loading || !user?.id || isPro) return;
    const key = STORAGE_KEY_PREFIX + user.id;
    try {
      if (window.localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => {
      setOpen(true);
      trackEvent("free_welcome_shown", { user_id: user.id });
    }, 1200);
    return () => clearTimeout(t);
  }, [loading, user?.id, isPro, suppressed]);

  const dismiss = () => {
    try {
      if (user?.id) {
        window.localStorage.setItem(STORAGE_KEY_PREFIX + user.id, "1");
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!user?.id || isPro) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto p-0 sm:w-full">
        <div className="relative overflow-hidden bg-gradient-to-br from-gold/25 via-gold/10 to-transparent px-6 pb-5 pt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-gold text-navy shadow-gold">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogHeader className="mt-3">
            <DialogTitle className="font-serif text-2xl">
              Добре дошли в Dogovori.net
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              Безплатен профил: <strong className="text-foreground">{FREE_OFFER_RULE}</strong>.
              Разглеждането на каталога, изготвянето на документи и качването за анализ са неограничени.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-2 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            С Предприемач отключвате
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/20">
                  <p.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-6 pb-[calc(env(safe-area-inset-bottom,0)+1.25rem)] pt-3 sm:flex-row">
          <Button asChild className="flex-1 bg-gradient-gold text-navy hover:shadow-gold">
            <Link to="/catalog" onClick={dismiss}>
              Разгледай каталога <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            <Link
              to="/plans"
              onClick={() => {
                trackEvent("free_welcome_plans_click", {});
                dismiss();
              }}
            >
              Виж плановете
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
