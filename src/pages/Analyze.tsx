/**
 * /analiz — страницата за проверка на собствен договор.
 *
 * Публичната версия не показва примерен резултат. Всеки посетител отива към
 * реалната проверка в акаунта, която работи с качения документ.
 *
 * При валиден ?product= страницата показва точното ограничение на платения
 * продукт (само PDF с четим текст или DOCX, до 60 000 знака, без сканирани
 * файлове), а не общите възможности на безплатната проверка.
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileUp, ShieldCheck, Sparkles, Lock } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { markFunnelStep, trackFunnelEvent } from "@/lib/funnel";
import { getProduct, parseProductParam } from "@/lib/products";
import {
  PRODUCT_ACCEPTED_INPUT,
  PRODUCT_MAX_SOURCE_CHARS,
} from "@/lib/productSource";

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

  // В продуктов режим показваме точно платеното ограничение; в общия режим —
  // реално поддържаните възможности на проверката в акаунта.
  const FEATURES = productCopy
    ? [
        {
          icon: ShieldCheck,
          title: "Точно място в документа",
          body: "Всяка находка сочи мястото в текста и цитира извадката, за да я проверите. Липсващите клаузи са означени като препоръка, не като цитат.",
        },
        {
          icon: FileUp,
          title: PRODUCT_ACCEPTED_INPUT,
          body: `Четем целия документ до ${PRODUCT_MAX_SOURCE_CHARS.toLocaleString("bg-BG")} знака. Ако текстът е по-дълъг или не се разчита, не приемаме плащане — не съкращаваме документа тихо.`,
        },
        {
          icon: Sparkles,
          title: "Един документ, един резултат",
          body: "Резултатът е обвързан с точния файл, който сте качили. При промяна на документа проверката се прави наново.",
        },
      ]
    : [
        {
          icon: ShieldCheck,
          title: "Точно място в документа",
          body: "Всяка находка сочи мястото в текста и цитира извадката, за да я проверите. Липсващите клаузи са означени като препоръка, не като цитат.",
        },
        {
          icon: Sparkles,
          title: "И сканирани документи",
          body: "Разчитаме и сканирани PDF файлове — първите 3 страници са включени, всяка следваща е +1 операция.",
        },
        {
          icon: FileUp,
          title: "PDF, Word или текст",
          body: "Качвате файл до 10 MB или поставяте текста. Времето за обработка зависи от обема на документа.",
        },
      ];

  return (
    <>
      <Seo
        title="Проверка на договор — какво поемате и какво да промените"
        description="Качвате PDF или Word файл и виждате какво поемате по договора, кои клаузи носят риск и какво да промените, с точно място в текста. Резултатът е автоматичен и не е правен съвет."
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
              {productCopy ? productCopy.name : "Проверка на договор"}
            </p>
            <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight sm:text-4xl md:text-5xl">
              {productCopy ? (
                productCopy.name
              ) : (
                <>
                  Какво поемате с{" "}
                  <em className="not-italic text-gold">този договор</em>
                </>
              )}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              {productCopy
                ? productCopy.promise
                : "Качвате PDF или Word файл. Виждате какво поемате, кои клаузи носят риск за Вас и какво да промените — с точното място в текста. Резултатът е автоматичен и не е правен съвет."}
            </p>
          </header>

          <div className="mt-8 rounded-2xl border border-gold/30 bg-card/70 p-6 shadow-elegant sm:p-8">
            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              <Lock className="h-3.5 w-3.5" /> Изисква акаунт
            </div>
            <h2 className="mt-3 text-center font-serif text-2xl font-bold leading-tight sm:text-3xl">
              Влезте или се регистрирайте, за да качите документа
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
              {productCopy ? (
                <>Проверката работи с Вашия файл и е достъпна само в акаунта. {PRODUCT_ACCEPTED_INPUT}</>
              ) : (
                <>
                  Проверката работи с Вашия файл — затова е достъпна само в
                  акаунта. Регистрацията е безплатна и включва{" "}
                  <strong>една пълна проверка</strong>.
                </>
              )}
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={goSignup}
                className="btn-gold btn-sheen btn-press inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold"
              >
                <FileUp className="h-4 w-4" />{" "}
                {productCopy ? productCopy.ctaLabel : "Регистрирайте се и качете документа"}
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
            {FEATURES.map(({ icon: Icon, title, body }) => (
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
