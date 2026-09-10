/**
 * Купуване на един еднократен продукт за един документ.
 *
 * Пътят е кратък: качвате документ → казвате коя страна сте → потвърждавате
 * четирите условия → плащате. Няма абонамент и няма операции/кредити.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import {
  ONE_TIME_TERMS,
  getProductBySlug,
  legacyProductRedirect,
  productPath,
  productPriceLabel,
} from "@/lib/products";
import {
  ProductUploadError,
  prepareProductDocument,
  type PreparedProductDocument,
} from "@/lib/productUpload";

type Position = "conservative" | "balanced" | "assertive";

const POSITIONS: readonly { value: Position; label: string }[] = [
  { value: "conservative", label: "Предпазлива" },
  { value: "balanced", label: "Балансирана" },
  { value: "assertive", label: "Настъпателна" },
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
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [prepared, setPrepared] = useState<PreparedProductDocument | null>(null);
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState("");
  const [objective, setObjective] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [position, setPosition] = useState<Position>("balanced");

  const [terms, setTerms] = useState(false);
  const [aiAck, setAiAck] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [withdrawal, setWithdrawal] = useState(false);

  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    const legacy = legacyProductRedirect(slug);
    if (!product && legacy) navigate(`${legacy}/start`, { replace: true });
  }, [product, slug, navigate]);

  const needsObjective = product?.id !== "contract_check";
  const needsCounterparty = product?.id === "negotiation_package";
  const allConsents = terms && aiAck && immediate && withdrawal;
  const canPay = Boolean(prepared) && role.trim().length > 1 && allConsents && !busy;

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
    if (!user) return;
    setBusy(true);
    try {
      const result = await prepareProductDocument({
        userId: user.id,
        title: title || file?.name?.replace(/\.[^.]+$/, "") || "Документ",
        file,
        pastedText: pasted,
        onPhase: setPhase,
      });
      setPrepared(result);
      toast.success("Документът е готов за обработка.");
    } catch (e) {
      toast.error(
        e instanceof ProductUploadError || e instanceof Error
          ? e.message
          : "Неуспешно качване.",
      );
    } finally {
      setPhase("");
      setBusy(false);
    }
  };

  const handlePay = async () => {
    if (!prepared || !allConsents || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-product-checkout", {
        body: {
          productId: product.id,
          uploadedContractId: prepared.uploadedContractId,
          requestId: requestIdRef.current,
          environment: getStripeEnvironment(),
          origin: window.location.origin,
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

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 md:pb-16">
      <p className="text-sm text-muted-foreground">
        <Link to={productPath(product)} className="underline">{product.name}</Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
        Купувате: {product.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{ONE_TIME_TERMS}</p>

      {/* 1) Документът */}
      <Card className="mt-6 p-4 md:p-6">
        <h2 className="text-lg font-semibold">1. Вашият документ</h2>
        {prepared ? (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-medium">{prepared.title}</p>
            <p className="text-muted-foreground">
              {prepared.originalFilename ?? "Поставен текст"} · {prepared.source.toUpperCase()} ·{" "}
              {prepared.textLength} знака прочетени
            </p>
            <p className="text-muted-foreground">
              Отпечатък на текста: {prepared.sourceHash.slice(0, 12)}…
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="product-title">Заглавие</Label>
              <Input
                id="product-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Договор за наем — офис"
              />
            </div>
            <div>
              <Label htmlFor="product-file">Файл (PDF или DOCX)</Label>
              <Input
                id="product-file"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label htmlFor="product-paste">Или поставете текста</Label>
              <Textarea
                id="product-paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder="Поставете текста на документа…"
              />
            </div>
            <Button type="button" onClick={handlePrepare} disabled={busy} className="min-h-11">
              {busy ? (phase || "Обработка…") : "Продължете"}
            </Button>
          </div>
        )}
      </Card>

      {/* 2) Контекст */}
      <Card className="mt-4 p-4 md:p-6">
        <h2 className="text-lg font-semibold">2. Вашата страна</h2>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="product-role">Коя страна сте по документа?</Label>
            <Input
              id="product-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Например: наемател, изпълнител, купувач"
            />
          </div>
          {needsObjective && (
            <>
              <div>
                <Label htmlFor="product-objective">Какво искате да постигнете?</Label>
                <Textarea
                  id="product-objective"
                  value={objective}
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
              <Label htmlFor="product-counterparty">Кой е другата страна и какви са отношенията?</Label>
              <Textarea
                id="product-counterparty"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                rows={3}
                placeholder="Например: дългогодишен доставчик, искаме да запазим отношенията"
              />
            </div>
          )}
        </div>
      </Card>

      {/* 3) Цена и условия */}
      <Card className="mt-4 p-4 md:p-6">
        <h2 className="text-lg font-semibold">3. Цена и условия</h2>
        <p className="mt-2 text-sm">
          <span className="font-medium">{product.name}</span> — {priceLabel}, еднократно, без
          абонамент.
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
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
          <label className="flex items-start gap-3">
            <Checkbox checked={aiAck} onCheckedChange={(v) => setAiAck(v === true)} />
            <span>
              Разбирам, че резултатът е автоматичен и не е юридически съвет.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <Checkbox checked={immediate} onCheckedChange={(v) => setImmediate(v === true)} />
            <span>Искам обработката да започне веднага след плащането.</span>
          </label>
          <label className="flex items-start gap-3">
            <Checkbox checked={withdrawal} onCheckedChange={(v) => setWithdrawal(v === true)} />
            <span>
              Разбирам, че след започване на обработката губя правото на отказ за вече
              доставеното съдържание.
            </span>
          </label>
        </div>

        {!clientSecret ? (
          <Button
            type="button"
            className="mt-5 min-h-12 w-full"
            disabled={!canPay}
            onClick={handlePay}
          >
            Към плащане · {priceLabel}
          </Button>
        ) : (
          <div className="mt-5">
            <StripeEmbeddedCheckout
              clientSecret={clientSecret}
              analyticsSource="product_checkout"
              analyticsPlan={product.id}
              analyticsBilling="one_time"
            />
          </div>
        )}
      </Card>
    </main>
  );
}
