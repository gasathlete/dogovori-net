/**
 * Купуване на един еднократен продукт за един документ.
 *
 * Пътят е кратък и стъпка по стъпка: качвате файл → казвате коя страна сте →
 * потвърждавате четирите условия и плащате. Готовите стъпки се свиват до кратко
 * резюме и се отварят отново, докато плащането не е отворено.
 *
 * След като плащането се отвори, документът, контекстът и съгласията са
 * заключени: така плащате точно това, което сте видели. „Започнете отначало“
 * прави нова заявка.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { ProductPrice } from "@/components/products/ProductPrice";
import {
  CheckoutStepper,
  type CheckoutStep,
} from "@/components/products/CheckoutStepper";
import {
  ONE_TIME_TERMS,
  getProductBySlug,
  legacyProductRedirect,
  productPath,
  productPriceLabel,
} from "@/lib/products";
import {
  PRODUCT_PERSIST_FAILED_MESSAGE,
  ProductUploadError,
  prepareProductDocument,
  type PreparedProductDocument,
} from "@/lib/productUpload";
import { DocumentFilePicker } from "@/components/products/DocumentFilePicker";
import { CheckCircle2, FileUp } from "@/icons";

type Position = "conservative" | "balanced" | "assertive";
type StepId = "document" | "context" | "payment";

const POSITIONS: readonly { value: Position; label: string }[] = [
  { value: "conservative", label: "Предпазлива" },
  { value: "balanced", label: "Балансирана" },
  { value: "assertive", label: "Настъпателна" },
];

const STEPS: readonly CheckoutStep[] = [
  { id: "document", label: "Документ" },
  { id: "context", label: "Вашата страна" },
  { id: "payment", label: "Плащане" },
];

export default function ProductCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const product = getProductBySlug(slug);

  // Един и същ requestId при повторен опит в същата сесия — така не се създава
  // втора заявка и втора Stripe сесия.
  const requestIdRef = useRef<string>(crypto.randomUUID());

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [prepared, setPrepared] = useState<PreparedProductDocument | null>(null);
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState("");
  const [objective, setObjective] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [position, setPosition] = useState<Position>("balanced");

  /**
   * Едно изрично съгласие към Условията за покупка. Условията изброяват четирите
   * точки (условия и поверителност, автоматичен резултат, незабавно изпълнение,
   * загуба на правото на отказ), затова сървърът получава истината както е дадена.
   */
  const [purchaseTerms, setPurchaseTerms] = useState(false);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  /** Отворена стъпка по избор на човека; иначе следва естествения ред. */
  const [openStep, setOpenStep] = useState<StepId | null>(null);

  useEffect(() => {
    const legacy = legacyProductRedirect(slug);
    if (!product && legacy) navigate(`${legacy}/start`, { replace: true });
  }, [product, slug, navigate]);

  const needsObjective = product?.id !== "contract_check";
  const needsCounterparty = product?.id === "negotiation_package";
  const allConsents = terms && aiAck && immediate && withdrawal;
  // Плащаме само когато имаме всичко, което продуктът реално ползва.
  const contextReady =
    role.trim().length > 1 &&
    (!needsObjective || objective.trim().length > 1) &&
    (!needsCounterparty || counterparty.trim().length > 1);
  const locked = clientSecret !== null;
  const canPay = Boolean(prepared) && contextReady && allConsents && !busy && !locked;

  const naturalStep: StepId = !prepared
    ? "document"
    : !contextReady
      ? "context"
      : "payment";
  const activeStep: StepId = locked ? "payment" : (openStep ?? naturalStep);
  const doneSteps: StepId[] = [
    ...(prepared ? (["document"] as StepId[]) : []),
    ...(prepared && contextReady ? (["context"] as StepId[]) : []),
  ];

  const priceLabel = useMemo(
    () => (product ? productPriceLabel(product.id) : ""),
    [product],
  );

  if (!product) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Продуктът не е намерен</h1>
        <p className="mt-3 text-muted-foreground">
          <Link to="/produkti" className="underline">Вижте всички продукти</Link>
        </p>
      </main>
    );
  }

  const handlePrepare = async () => {
    if (!user || !file) return;
    setBusy(true);
    try {
      const result = await prepareProductDocument({
        userId: user.id,
        title: title || file.name.replace(/\.[^.]+$/, "") || "Документ",
        file,
        onPhase: setPhase,
      });
      setPrepared(result);
      // Контекстът остава отворен, докато човекът сам не потвърди стъпката.
      setOpenStep("context");
      toast.success("Документът е прочетен целият.");
    } catch (e) {
      // Само вече обезопасените съобщения стигат до човека. Всичко останало
      // получава едно и също общо изречение — никакви технически детайли.
      toast.error(
        e instanceof ProductUploadError ? e.message : PRODUCT_PERSIST_FAILED_MESSAGE,
      );
    } finally {
      setPhase("");
      setBusy(false);
    }
  };

  const changeDocument = () => {
    setPrepared(null);
    setFile(null);
    setTitle("");
    setOpenStep(null);
  };

  /** Изрично започване отначало: нова заявка, нова сесия, нищо заварено. */
  const restart = () => {
    requestIdRef.current = crypto.randomUUID();
    setClientSecret(null);
    changeDocument();
    setPurchaseTerms(false);
    setOpenStep(null);
  };

  const handlePay = async () => {
    if (!prepared || !canPay) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-product-checkout", {
        body: {
          productId: product.id,
          uploadedContractId: prepared.uploadedContractId,
          requestId: requestIdRef.current,
          environment: getStripeEnvironment(),
          context: {
            role: role.trim(),
            ...(needsObjective ? { objective: objective.trim(), preferred_position: position } : {}),
            ...(needsCounterparty ? { counterparty_context: counterparty.trim() } : {}),
          },
          termsAccepted: terms,
          aiAckAccepted: aiAck,
          immediatePerformanceConsent: immediate,
          withdrawalLossAcknowledged: withdrawal,
        },
      });
      if (error || !data?.clientSecret) throw new Error(error?.message ?? "checkout_failed");
      setClientSecret(data.clientSecret as string);
    } catch (e) {
      toast.error("Не успяхме да отворим плащането. Плащане не е извършено.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  /** Кратко, вярно резюме на свитата стъпка „Вашата страна“. */
  const contextSummary = [
    role.trim() && `Страна: ${role.trim()}`,
    needsObjective && objective.trim() && `Цел: ${objective.trim()}`,
    needsObjective &&
      `Позиция: ${POSITIONS.find((p) => p.value === position)?.label ?? ""}`,
    needsCounterparty && counterparty.trim() && `Друга страна: ${counterparty.trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * Свита стъпка: един компактен ред. Ако е достъпна, се отваря с „Промени“;
   * заключените стъпки не се правят на кликаеми.
   */
  const summaryRow = (
    testId: string,
    index: number,
    heading: string,
    detail: ReactNode,
    reopenStep: StepId | null,
  ) => (
    <div
      data-testid={testId}
      className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
    >
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-[11px] font-semibold tabular-nums text-muted-foreground">
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{heading}</span>
        <span className="block line-clamp-2 text-xs text-muted-foreground">{detail}</span>
      </span>
      {reopenStep && !locked && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={() => setOpenStep(reopenStep)}
        >
          Промени
        </Button>
      )}
    </div>
  );

  const priceBlock = (compact: boolean) => (
    <div
      data-testid="product-price-summary"
      className={
        compact
          ? "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5"
          : "mt-3 rounded-xl border border-gold/30 bg-gold/5 p-3"
      }
    >
      <ProductPrice id={product.id} size="md" showLabel />
      <p className="text-xs text-muted-foreground">
        За един документ, еднократно, без абонамент.
      </p>
    </div>
  );

  return (
    <>
      <Seo
        title={`${product.name} — плащане`}
        description="Плащане за един документ, еднократно, без абонамент."
        noindex
      />
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 md:pb-16">
        <p className="truncate text-sm text-muted-foreground">
          <Link to={productPath(product)} className="underline">{product.name}</Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          Купувате: {product.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{ONE_TIME_TERMS}</p>

        <section
          aria-label="Резюме на покупката"
          className="mt-4 grid gap-3 border-y border-border/70 py-4 sm:grid-cols-2"
        >
          <div className="flex gap-3">
            <FileUp className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Вие качвате</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {product.page.youProvide[0]}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Вие получавате</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {product.page.youReceive[0]}
              </p>
            </div>
          </div>
        </section>

        <CheckoutStepper
          className="mt-4"
          steps={STEPS}
          activeId={activeStep}
          doneIds={doneSteps}
        />

        {/* 1) Документът */}
        {activeStep === "document" ? (
          <Card className="mt-4 rounded-2xl p-4 md:p-6">
            <h2 className="text-lg font-semibold">1. Вашият документ</h2>
            {prepared ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="truncate font-medium">{prepared.title}</p>
                <p className="truncate text-muted-foreground">
                  {prepared.originalFilename}
                  {prepared.pageCount ? ` · ${prepared.pageCount} стр.` : ""} · прочетен целият
                </p>
                {prepared.preview && (
                  <p className="line-clamp-3 rounded-md bg-muted/50 p-3 text-muted-foreground">
                    „{prepared.preview}…“
                  </p>
                )}
                {!locked && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={changeDocument}
                    >
                      Смени документа
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => setOpenStep("context")}
                    >
                      Продължете
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <DocumentFilePicker file={file} onSelect={setFile} disabled={busy} />
                <div>
                  <Label htmlFor="product-title">Заглавие (по избор)</Label>
                  <Input
                    id="product-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Например: Договор за наем — офис"
                    className="min-h-11"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handlePrepare}
                  disabled={busy || !file}
                  className="min-h-12 w-full sm:w-auto"
                >
                  {busy ? (phase || "Обработка…") : "Продължете"}
                </Button>
              </div>
            )}
          </Card>
        ) : (
          summaryRow(
            "step-summary-document",
            1,
            prepared?.originalFilename || prepared?.title || "Вашият документ",
            prepared
              ? `Прочетен целият${prepared.pageCount ? ` · ${prepared.pageCount} стр.` : ""}`
              : "Още не е качен",
            prepared ? "document" : null,
          )
        )}

        {/* 2) Контекст — отваря се само след като документът е прочетен */}
        {activeStep === "context" ? (
          <Card className="mt-3 rounded-2xl p-4 md:p-6">
            <h2 className="text-lg font-semibold">2. Вашата страна</h2>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="product-role">Коя страна сте по документа?</Label>
                <Input
                  id="product-role"
                  value={role}
                  disabled={locked}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Например: наемател, изпълнител, купувач"
                  className="min-h-11"
                />
              </div>
              {needsObjective && (
                <>
                  <div>
                    <Label htmlFor="product-objective">Какво искате да постигнете?</Label>
                    <Textarea
                      id="product-objective"
                      value={objective}
                      disabled={locked}
                      onChange={(e) => setObjective(e.target.value)}
                      rows={3}
                      placeholder="Например: по-кратък срок за плащане и таван на отговорността"
                    />
                  </div>
                  <fieldset>
                    <legend className="text-sm font-medium">Каква позиция предпочитате?</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {POSITIONS.map((p) => (
                        <Button
                          key={p.value}
                          type="button"
                          variant={position === p.value ? "default" : "outline"}
                          aria-pressed={position === p.value}
                          disabled={locked}
                          className="min-h-11"
                          onClick={() => setPosition(p.value)}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              {needsCounterparty && (
                <div>
                  <Label htmlFor="product-counterparty">
                    Коя е другата страна и какви са отношенията?
                  </Label>
                  <Textarea
                    id="product-counterparty"
                    value={counterparty}
                    disabled={locked}
                    onChange={(e) => setCounterparty(e.target.value)}
                    rows={3}
                    placeholder="Например: дългогодишен доставчик, искаме да запазим отношенията"
                  />
                </div>
              )}
              <Button
                type="button"
                className="min-h-12 w-full sm:w-auto"
                disabled={!contextReady}
                onClick={() => setOpenStep("payment")}
              >
                Продължете
              </Button>
            </div>
          </Card>
        ) : (
          summaryRow(
            "step-summary-context",
            2,
            "Вашата страна",
            prepared
              ? contextSummary || "Още не сте попълнили тази стъпка."
              : "След документа",
            prepared ? "context" : null,
          )
        )}

        {/* 3) Цена и условия */}
        {activeStep === "payment" ? (
          <Card className="mt-3 rounded-2xl p-4 md:p-6">
            <h2 className="text-lg font-semibold">3. Цена и условия</h2>
            {priceBlock(false)}
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex min-h-11 items-start gap-3">
                <Checkbox
                  checked={terms}
                  disabled={locked}
                  onCheckedChange={(v) => setTerms(v === true)}
                />
                <span>
                  Приемам{" "}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                    Общите условия
                  </Link>{" "}
                  и{" "}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                    Политиката за поверителност
                  </Link>
                  .
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <Checkbox
                  checked={aiAck}
                  disabled={locked}
                  onCheckedChange={(v) => setAiAck(v === true)}
                />
                <span>
                  Разбирам, че резултатът е автоматичен и не е юридически съвет.
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <Checkbox
                  checked={immediate}
                  disabled={locked}
                  onCheckedChange={(v) => setImmediate(v === true)}
                />
                <span>Искам обработката да започне веднага след плащането.</span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <Checkbox
                  checked={withdrawal}
                  disabled={locked}
                  onCheckedChange={(v) => setWithdrawal(v === true)}
                />
                <span>
                  Разбирам, че след започване на обработката губя правото на отказ за вече
                  доставеното съдържание.
                </span>
              </label>
            </div>

            {!locked ? (
              <Button
                type="button"
                className="mt-5 min-h-12 w-full"
                disabled={!canPay}
                onClick={handlePay}
              >
                Към плащане · {priceLabel}
              </Button>
            ) : (
              <div className="mt-5 space-y-3">
                <StripeEmbeddedCheckout
                  clientSecret={clientSecret}
                  analyticsSource="product_checkout"
                  analyticsPlan={product.id}
                  analyticsBilling="one_time"
                />
                <p className="text-sm text-muted-foreground">
                  Плащате точно за документа и условията по-горе. Ако искате друг документ:
                </p>
                <Button type="button" variant="outline" className="min-h-11" onClick={restart}>
                  Започнете отначало
                </Button>
              </div>
            )}
          </Card>
        ) : (
          priceBlock(true)
        )}
      </main>
    </>
  );
}
