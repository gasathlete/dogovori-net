/**
 * /analiz — landing page за реален AI риск-анализ.
 *
 * Публичната версия НЕ прави фалшив/примерен анализ. Всеки посетител се
 * насочва към реалния OCR + AI пайплайн в акаунта (analyze-contract edge
 * функцията), който работи с истинския качен документ и не халюцинира
 * тип на договор.
 *
 * Логнати потребители → директно към формата за качване в /account.
 * Анонимни потребители → CTA за регистрация; след вход попадат в същата
 * форма (redirect параметърът пренася namерението).
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileUp, ShieldCheck, Sparkles, Lock } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { markFunnelStep, trackFunnelEvent } from "@/lib/funnel";
import { getProduct, parseProductParam } from "@/lib/products";

const UPLOAD_ROUTE = "/account?tab=documents&action=upload";

export default function Analyze() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Само allowlist-нати продуктови стойности се четат — непознати падат до
  // null и страницата остава в стандартния си вид. Нищо в генерирането,
  // quota-та или auth поведението не се променя.
  const product = parseProductParam(params.get("product"));
  const uploadRoute = useMemo(
    () => (product ? `${UPLOAD_ROUTE}&product=${product}` : UPLOAD_ROUTE),
    [product],
  );

  // Всеки логнат потребител отива направо в реалната форма за качване +
  // анализ. Free акаунтите получават 1 безплатен пълен анализ през месеца
  // (quota пътят), платените — според плана си.
  useEffect(() => {
    if (!loading && user) {
      navigate(uploadRoute, { replace: true });
    }
  }, [loading, user, navigate, uploadRoute]);

  useEffect(() => {
    markFunnelStep(3);
  }, []);

  const goSignup = () => {
    trackFunnelEvent("funnel_analyze_signup_click", {
      source: "analiz_landing",
      product: product ?? "none",
    });
    navigate(`/auth?tab=signup&redirect=${encodeURIComponent(uploadRoute)}`);
  };

  const goLogin = () => {
    trackFunnelEvent("funnel_analyze_login_click", {
      source: "analiz_landing",
      product: product ?? "none",
    });
    navigate(`/auth?tab=login&redirect=${encodeURIComponent(uploadRoute)}`);
  };

  const productCopy = product ? getProduct(product) : null;


  return (
    <>
      <Seo
        title="AI риск-анализ на договор — Договори.нет"
        description="Качи PDF или Word файл на реален договор. Нашият AI извлича клаузите, сверява ги със ЗЗД/ТЗ и посочва рисковете дословно, без да измисля."
        canonical="https://dogovori.net/analiz"
      />
      <Header />

      <main className="relative min-h-dvh bg-background pb-24 pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] opacity-50"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--gold) / 0.18), transparent 70%)",
          }}
        />

        <section className="container relative mx-auto max-w-2xl px-4">
          <header className="text-center" data-product={product ?? "none"}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              {productCopy ? productCopy.name : "Реален AI анализ"}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
              {productCopy ? (
                productCopy.name
              ) : (
                <>
                  AI риск-анализ на{" "}
                  <em className="not-italic text-gold">твоя реален договор</em>
                </>
              )}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              {productCopy
                ? productCopy.promise
                : "Качваш PDF или Word файл — системата извлича текста (с OCR при нужда), сверява клаузите със ЗЗД и Търговския закон и посочва рисковете дословно от документа. Без предварително подготвени шаблонни отговори."}
            </p>
          </header>

          <div className="mt-8 rounded-2xl border border-gold/30 bg-card/70 p-6 shadow-elegant sm:p-8">
            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              <Lock className="h-3.5 w-3.5" /> Изисква акаунт
            </div>
            <h2 className="mt-3 text-center font-serif text-2xl font-bold leading-tight sm:text-3xl">
              Влез или се регистрирай, за да качиш договор
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
              Реалният анализ работи с твоя файл — затова е достъпен само в
              акаунта. Регистрацията е безплатна и включва <strong>1 пълен
              риск-анализ</strong> и достъп до OCR за сканирани документи.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={goSignup}
                className="btn-gold btn-sheen btn-press inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold"
              >
                <FileUp className="h-4 w-4" />{" "}
                {productCopy ? productCopy.ctaLabel : "Регистрирай се и качи договор"}
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 px-6 py-3 text-[15px] font-semibold text-foreground transition-colors hover:border-gold/60"
              >
                Вече имам акаунт
              </button>
            </div>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Проверими цитати",
                body: "Всяка находка се придружава от дословен цитат от твоя договор и се проверява срещу текста. Непотвърдените находки не се представят като установени факти. Липсващите клаузи са препоръки, а не цитати.",
              },
              {
                icon: Sparkles,
                title: "OCR за сканирани",
                body: "Разпознаваме и сканирани PDF-и — първите 3 страници са включени, всяка следваща е +1 операция.",
              },
              {
                icon: FileUp,
                title: "PDF, Word или текст",
                body: "Качваш файл до 10 MB или поставяш текст. Времето за обработка зависи от обема на документа.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <Icon className="h-5 w-5 text-gold" />
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
