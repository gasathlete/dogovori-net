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
import { WorkStepStrip, type WorkStep } from "@/components/workspace/WorkStepStrip";
import { RAW_FILE_INGRESS_ALLOWED } from "@/lib/privacyGate";

const UPLOAD_ROUTE = "/account?tab=documents&action=upload";

/** Реалната последователност на проверката — без стъпки, които не съществуват. */
const ANALYZE_STEPS: WorkStep[] = [
  { id: "document", label: "Документ" },
  { id: "check", label: "Проверка" },
  { id: "result", label: "Резултат" },
];

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
    if (RAW_FILE_INGRESS_ALLOWED && !loading && user) {
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
        description={RAW_FILE_INGRESS_ALLOWED
          ? "Качвате PDF или Word файл и виждате какво поемате по договора, кои клаузи носят риск и какво да промените, с точно място в текста. Резултатът е автоматичен и не е правен съвет."
          : "Проверката на договори е в подготовка. В момента не приемаме файлове и не отваряме плащане за услугата."}
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
          <header data-product={product ?? "none"}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              {productCopy ? productCopy.name : "Проверка на документ"}
            </p>
            <h1 className="mt-2 font-serif text-[30px] font-bold leading-tight sm:text-4xl">
              {productCopy ? (
                productCopy.name
              ) : (
                <>
                  Какво поемате с{" "}
                  <em className="not-italic text-gold">този документ</em>
                </>
              )}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {!RAW_FILE_INGRESS_ALLOWED
                ? "Подготвяме проверката на договори. Качването на файлове и плащането за тази услуга са временно недостъпни."
                : productCopy
                ? productCopy.promise
                : "Качвате документа и виждате какво поемате, кои клаузи носят риск за Вас и какво да промените — с точното място в текста."}
            </p>
          </header>

          {/* Последователността на екрана: документ → проверка → резултат. */}
          {RAW_FILE_INGRESS_ALLOWED && <WorkStepStrip steps={ANALYZE_STEPS} current={0} className="mt-5" />}

          <div className="mt-4 rounded-2xl border border-gold/30 bg-card/70 p-5 shadow-elegant sm:p-6">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              <Lock className="h-3.5 w-3.5" /> {RAW_FILE_INGRESS_ALLOWED ? "Изисква акаунт" : "В подготовка"}
            </div>
            <h2 className="mt-2 font-serif text-xl font-bold leading-tight sm:text-2xl">
              {RAW_FILE_INGRESS_ALLOWED ? "Влезте, за да качите документа" : "Проверката временно не приема документи"}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {!RAW_FILE_INGRESS_ALLOWED ? (
                <>В момента не приемаме PDF и Word файлове и не отваряме плащане за проверка. Ще обявим услугата, когато защитеният път за документите е готов.</>
              ) : productCopy ? (
                <>Проверката работи с Вашия файл и е достъпна само в акаунта. {PRODUCT_ACCEPTED_INPUT}</>
              ) : (
                <>
                  Проверката работи с Вашия файл, затова е достъпна само в акаунта.
                  Регистрацията е безплатна и включва{" "}
                  <strong>една пълна проверка</strong>.
                </>
              )}
            </p>

            {RAW_FILE_INGRESS_ALLOWED && <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={goSignup}
                className="btn-gold btn-sheen btn-press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold"
              >
                <FileUp className="h-4 w-4" />{" "}
                {productCopy ? productCopy.ctaLabel : "Качете документа"}
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/60 px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-gold/60"
              >
                Вече имам акаунт
              </button>
            </div>}
          </div>

          {/* Подробностите стоят на едно място и са свити по подразбиране. */}
          {RAW_FILE_INGRESS_ALLOWED && <details
            data-testid="analyze-details"
            className="group mt-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-foreground">
              Какво получавате и какви файлове приемаме
              <span className="text-[13px] font-normal text-muted-foreground group-open:hidden">
                Отворете
              </span>
            </summary>
            <ul className="mt-2 grid gap-3" role="list">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-foreground">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted-foreground">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>}

          <p className="mt-3 text-[13px] text-muted-foreground">
            Резултатът е автоматичен и не е правен съвет.
          </p>
        </section>
      </main>
    </>
  );
}

