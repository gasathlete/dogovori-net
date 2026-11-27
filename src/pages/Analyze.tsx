/**
 * /analiz — страницата за проверка на собствен договор.
 *
 * Публичната версия не показва примерен резултат. Всеки посетител отива към
 * реалната проверка в акаунта, която работи с поставения текст.
 *
 * При валиден ?product= страницата показва точното ограничение на платения
 * продукт (само PDF с четим текст или DOCX, до 60 000 знака, без сканирани
 * файлове), а не общите възможности на безплатната проверка.
 */
import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileUp, ShieldCheck, Sparkles, Lock } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { markFunnelStep, trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_PRELAUNCH_MESSAGE,
  ONE_TIME_PURCHASES_AVAILABLE,
  productPriceLabel,
  getProduct,
  parseProductParam,
} from "@/lib/products";
import { FREE_OFFER_RULE } from "@/lib/pricing";
import { isFeatureAvailable } from "@/lib/prelaunch";
import {
  PRODUCT_ACCEPTED_INPUT,
  PRODUCT_MAX_SOURCE_CHARS,
} from "@/lib/productSource";
import { WorkStepStrip, type WorkStep } from "@/components/workspace/WorkStepStrip";

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

  useEffect(() => {
    if (ONE_TIME_PURCHASES_AVAILABLE) markFunnelStep(3);
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
  const textReviewOpen = !productCopy && isFeatureAvailable("document_review");

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
          title: "Поставете текст",
          body: "Копирайте текста на документа. Заменете личните идентификатори с [ЕГН] или [IBAN] преди изпращане.",
        },
        {
          icon: FileUp,
          title: "Текст без качване на файл",
          body: "Приемаме поставен текст или PDF/Word файл, чийто текст се чете в браузъра Ви, без файлът да се качва. Сканирани документи не се разпознават.",
        },
      ];

  return (
    <>
      <Seo
        title="Проверка на договор — какво поемате и какво да промените"
        description={textReviewOpen
          ? "Поставете текста на документ и проверете условията, сроковете и рисковете. Проверете внимателно преди подписване."
          : ONE_TIME_PURCHASES_AVAILABLE
          ? "Качвате PDF или Word файл и виждате какво поемате по договора, кои клаузи носят риск и какво да промените, с точно място в текста. Резултатът е автоматичен и не е правен съвет. Проверете внимателно преди подписване."
          : "Проверката на договори е в подготовка. В момента не приемаме документи и не отваряме плащане за услугата."}
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
              {textReviewOpen
                ? "Поставете текста на документа и вижте кои условия, срокове и рискове изискват внимание."
                : !ONE_TIME_PURCHASES_AVAILABLE
                ? "Проверката е в подготовка. В момента не приемаме документи и не отваряме плащане за услугата."
                : productCopy
                ? productCopy.promise
                : "Качвате документа и виждате какво поемате, кои клаузи носят риск за Вас и какво да промените — с точното място в текста."}
            </p>
          </header>

          {/* Последователността на екрана: документ → проверка → резултат. */}
          {(textReviewOpen || ONE_TIME_PURCHASES_AVAILABLE) && <WorkStepStrip steps={ANALYZE_STEPS} current={0} className="mt-5" />}

          {textReviewOpen ? (
            <div className="mt-4 rounded-2xl border border-gold/30 bg-card/70 p-5 shadow-elegant sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Достъпно в тестовия период</p>
              <h2 className="mt-2 font-serif text-xl font-bold sm:text-2xl">Проверете текста на документ</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Безплатният профил включва {FREE_OFFER_RULE}. Поставете текста в профила си.
                Заменете личните идентификатори с [ЕГН] или [IBAN] преди изпращане.
                PDF и Word (.docx) файлове се четат в браузъра Ви, без да се качват. Сканирани документи не се разпознават.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={loading}
                  onClick={() => user ? navigate(uploadRoute) : goSignup()}
                  className="btn-gold inline-flex min-h-12 flex-1 items-center justify-center rounded-xl px-5 text-[15px] font-semibold disabled:opacity-50">
                  {user ? "Поставете текст за проверка" : "Създайте безплатен профил"}
                </button>
                {!user && <button type="button" disabled={loading} onClick={goLogin}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border/60 px-5 text-[15px] font-semibold">
                  Вход в профила
                </button>}
              </div>
              {ONE_TIME_PURCHASES_AVAILABLE && <p className="mt-3 text-[13px] text-muted-foreground">Нужна Ви е подробна проверка? <Link to="/produkti/proverka-predi-podpis/start" className="font-semibold underline underline-offset-2">Подробна проверка преди подпис</Link></p>}
            </div>
          ) : (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-card/70 p-5 shadow-elegant sm:p-6">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              <Lock className="h-3.5 w-3.5" /> Преди официалното пускане
            </div>
            <h2 className="mt-2 font-serif text-xl font-bold leading-tight sm:text-2xl">
              Качването за проверка още не е отворено
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {productCopy ? (
                <>
                  {ONE_TIME_PRELAUNCH_MESSAGE} Цената при пускане е{" "}
                  <strong>{productPriceLabel(productCopy.id)} с ДДС</strong> за един документ.
                </>
              ) : (
                <>
                  Безплатният профил включва {FREE_OFFER_RULE}. Подробната проверка
                  преди подпис е отделен еднократен продукт за{" "}
                  <strong>{productPriceLabel("contract_check")} с ДДС</strong> и още не
                  приема документи или плащания.
                </>
              )}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled
                className="inline-flex min-h-12 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-gold/35 bg-gold/[0.07] px-5 text-[15px] font-semibold text-foreground"
              >
                Качването предстои
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/60 px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-gold/60"
              >
                Вход в профила
              </button>
            </div>
          </div>

          )}

          {/* Подробностите стоят на едно място и са свити по подразбиране. */}
          <details
            data-testid="analyze-details"
            className="group mt-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-foreground">
              Какво получавате и какъв текст приемаме
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
          </details>

          <p className="mt-3 text-[13px] text-muted-foreground">
            Резултатът е автоматичен и не е правен съвет.
          </p>
        </section>
      </main>
    </>
  );
}

