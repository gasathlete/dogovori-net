/**
 * Платеният резултат: проверка, поправки и пакет за преговори.
 *
 * Страницата показва само проверени сървърни данни за ТОЧНО тази покупка.
 * Плащането е доказано двойно (платена поръчка + право за същата сесия), а
 * резултатът се приема само ако е обвързан с точния платен документ.
 * Няма примерни данни, няма „последната покупка“, няма мълчаливо отрязване.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { getProduct, isOneTimeProductId, productPathById } from "@/lib/products";
import {
  loadBoundSourceText,
  loadPaidPurchase,
  priceBg,
  readPaidAccessRequest,
  readPaidResult,
  sha256Hex,
  type PaidAccessRequest,
  type PaidPurchase,
} from "@/lib/productPaidResult";
import {
  fetchProductResultState,
  refineProductResult,
  saveProductSelection,
  startProductFulfillment,
  type ProductResultStateResponse,
  type ResultStateAccess,
} from "@/lib/productResultApi";
import {
  buildChangeReportPdf,
  buildCorrectedDocx,
  buildCorrectedPdf,
  buildNegotiationBriefPdf,
  buildReviewReportPdf,
  isProductResult,
  safeFileName,
} from "@/lib/productResultExports";
import { ReviewResult } from "@/components/product-result/ReviewResult";
import {
  CorrectionWorkspace,
  type SaveOutcome,
} from "@/components/product-result/CorrectionWorkspace";
import {
  NegotiationWorkspace,
  type RefineOutcome,
} from "@/components/product-result/NegotiationWorkspace";
import { ExportBar, type ExportAction } from "@/components/product-result/ExportBar";
import {
  trackCorrectedPreviewOpened,
  trackCorrectionSelected,
  trackExportCompleted,
  trackFindingOpened,
  trackQuietPlanLinkClicked,
  trackRefinementCompleted,
  trackRefinementFailed,
  trackRefinementSubmitted,
  trackResultProcessingSeen,
  trackResultReadySeen,
} from "@/lib/productResultAnalytics";
import {
  buildProductPatch,
  ProductPatchError,
  patchMessage,
  type ProductPatchManifest,
} from "../../supabase/functions/_shared/product-patch";
import type { CorrectionDecision } from "../../supabase/functions/_shared/product-selections";
import type { ReadyProductResult } from "../../supabase/functions/_shared/product-result-contract";

/** Изчакваме кратко и ограничено, с нарастваща пауза. */
const MAX_ATTEMPTS = 14;
const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 8000;

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "no_access" }
  | { readonly kind: "not_found" }
  | { readonly kind: "processing"; readonly productId: string }
  | { readonly kind: "failed"; readonly productId: string }
  | { readonly kind: "conflict" }
  | { readonly kind: "ready"; readonly purchase: PaidPurchase; readonly result: ReadyProductResult };

const CONTACT = (
  <>
    Свържете се с нас на{" "}
    <a href="mailto:support@dogovori.net" className="underline">
      support@dogovori.net
    </a>{" "}
    — плащането Ви е записано.
  </>
);

function accessFor(access: PaidAccessRequest, entitlementId: string): ResultStateAccess {
  return access.mode === "checkout_return"
    ? { mode: "checkout_return", entitlementId, sessionId: access.sessionId }
    : { mode: "owner", entitlementId };
}

export default function ProductResult() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const access = useMemo(() => readPaidAccessRequest(params), [params]);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [state, setState] = useState<ProductResultStateResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const attemptsRef = useRef(0);
  const fulfillRef = useRef(false);

  /* ------------------------- зареждане и изчакване ------------------------- */

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!access) {
      setPhase({ kind: "no_access" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    attemptsRef.current = 0;

    const tick = async () => {
      attemptsRef.current += 1;
      const purchase = await loadPaidPurchase(user.id, access).catch(() => null);
      if (cancelled) return;
      if (!purchase) {
        setPhase({ kind: "not_found" });
        return;
      }
      const row = purchase.entitlement;
      const outcome = readPaidResult(row);
      if (outcome.ok === true) {
        setPhase({ kind: "ready", purchase, result: outcome.result });
        return;
      }
      if (row.status === "ready" && outcome.ok === false && outcome.reason !== "not_ready") {
        // Плащането е налице, но резултатът не съвпада с документа — спираме.
        setPhase({ kind: "conflict" });
        return;
      }
      if (row.status === "failed" || row.status === "refunded") {
        setPhase({ kind: "failed", productId: row.product_id });
        return;
      }
      setPhase({ kind: "processing", productId: row.product_id });
      if (!fulfillRef.current) {
        fulfillRef.current = true;
        // Повторното заявяване е безопасно: не плаща пак и не ползва операции.
        void startProductFulfillment(row.id);
      }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setPhase({ kind: "failed", productId: row.product_id });
        return;
      }
      const delay = Math.min(FIRST_DELAY_MS * attemptsRef.current, MAX_DELAY_MS);
      timer = setTimeout(() => void tick(), delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, authLoading, access, reloadKey]);

  const entitlementId = phase.kind === "ready" ? phase.purchase.entitlement.id : null;

  useEffect(() => {
    if (phase.kind === "processing") trackResultProcessingSeen(phase.productId);
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    trackResultReadySeen(phase.result.product_id, phase.result.payload.findings.length);
  }, [phase]);

  // Състоянието на избора и на уточнението идва само от сървъра.
  useEffect(() => {
    if (!access || !entitlementId) return;
    let cancelled = false;
    void fetchProductResultState(accessFor(access, entitlementId)).then((outcome) => {
      if (cancelled) return;
      setState(outcome.ok ? outcome.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [access, entitlementId, reloadKey]);

  const reload = useCallback(() => {
    fulfillRef.current = false;
    setReloadKey((v) => v + 1);
    setPhase({ kind: "loading" });
  }, []);

  /* ------------------------------ поправките ------------------------------ */

  const buildPatch = useCallback(
    async (
      result: ReadyProductResult,
      purchase: PaidPurchase,
      decisions: readonly CorrectionDecision[],
    ): Promise<ProductPatchManifest> => {
      const outcome = readPaidResult(purchase.entitlement);
      if (outcome.ok === false) throw new Error("Документът се е променил. Презаредете страницата.");
      const source = await loadBoundSourceText(outcome.binding);
      if (source.ok === false) {
        throw new Error(
          source.reason === "not_found"
            ? "Не намираме текста на документа за тази покупка."
            : "Документът се е променил след плащането. Поправката не може да се приложи.",
        );
      }
      if (result.product_id === "contract_check") {
        throw new Error("Този продукт не съдържа поправки.");
      }
      try {
        return await buildProductPatch(
          {
            sourceText: source.text,
            sourceBinding: outcome.binding,
            resultBinding: result.source,
            corrections: result.payload.corrections,
            decisions,
          },
          sha256Hex,
        );
      } catch (error) {
        if (error instanceof ProductPatchError) throw new Error(patchMessage(error.reason));
        throw error;
      }
    },
    [],
  );

  const [manifest, setManifest] = useState<ProductPatchManifest | null>(null);

  const saveSelection = useCallback(
    async (decisions: readonly CorrectionDecision[]): Promise<SaveOutcome> => {
      if (phase.kind !== "ready" || !access) {
        return { ok: false, message: "Страницата трябва да се презареди." };
      }
      const outcome = await saveProductSelection(
        accessFor(access, phase.purchase.entitlement.id),
        {
          decisions,
          expectedVersion: state?.selection_version ?? 0,
          idempotencyKey: crypto.randomUUID(),
        },
      );
      if (outcome.ok === false) {
        const stale = outcome.failure.error === "selection_version_conflict";
        if (stale) {
          setState((prev) =>
            prev && typeof outcome.failure.selection_version === "number"
              ? { ...prev, selection_version: outcome.failure.selection_version }
              : prev,
          );
        }
        return {
          ok: false,
          message: stale
            ? "Изборът е бил променен от друг раздел. Презаредете страницата и решете отново."
            : outcome.failure.message,
        };
      }
      // Файловете се строят локално: проверяваме, че нашият изход е същият.
      try {
        const local = await buildPatch(phase.result, phase.purchase, decisions);
        if (local.output_hash.toLowerCase() !== outcome.data.output_hash.toLowerCase()) {
          setManifest(null);
          return {
            ok: false,
            message: "Поправеният текст не съвпада със записания. Презаредете страницата.",
          };
        }
        setManifest(local);
        setState((prev) =>
          prev ? { ...prev, selection_version: outcome.data.selection_version, decisions } : prev,
        );
        return { ok: true, correctedText: local.corrected_text };
      } catch (error) {
        setManifest(null);
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Поправеният документ не можа да се подготви.",
        };
      }
    },
    [access, phase, state?.selection_version, buildPatch],
  );

  /* ------------------------------ уточнението ----------------------------- */

  const refine = useCallback(
    async (instruction: string): Promise<RefineOutcome> => {
      if (phase.kind !== "ready" || !state) {
        return { ok: false, message: "Страницата трябва да се презареди." };
      }
      const outcome = await refineProductResult({
        entitlementId: phase.purchase.entitlement.id,
        instruction,
        expectedResultDigest: state.result_digest,
        expectedRefinementVersion: state.refinement?.current?.version ?? state.refinement?.used ?? 0,
        idempotencyKey: crypto.randomUUID(),
      });
      if (outcome.ok === false) {
        trackRefinementFailed(outcome.failure.error);
        return { ok: false, message: outcome.failure.message };
      }
      trackRefinementCompleted();
      reload();
      return { ok: true };
    },
    [phase, state, reload],
  );

  /* -------------------------------- изгледи ------------------------------- */

  const seo = (
    <Seo
      title="Вашият резултат"
      description="Резултатът от платената проверка на конкретен документ."
      noindex
    />
  );

  const frame = (children: React.ReactNode) => (
    <>
      {seo}
      <Header />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 md:pb-16 md:pt-12">{children}</main>
    </>
  );

  if (authLoading || phase.kind === "loading") {
    return frame(
      <div className="flex min-h-[40dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" aria-hidden />
        <span className="sr-only">Зареждаме покупката.</span>
      </div>,
    );
  }

  if (phase.kind === "no_access" || phase.kind === "not_found") {
    return frame(
      <>
        <h1 className="text-2xl font-semibold md:text-3xl">Няма намерена покупка</h1>
        <p className="mt-3 text-muted-foreground">
          {phase.kind === "no_access"
            ? "Отворете страницата от връзката, която получихте след плащането."
            : "Ако току-що платихте, изчакайте малко и опитайте отново."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/produkti">Вижте продуктите</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/account?tab=documents">Вашите документи</Link>
          </Button>
        </div>
      </>,
    );
  }

  if (phase.kind === "processing") {
    const name = isOneTimeProductId(phase.productId) ? getProduct(phase.productId).name : "Продукт";
    return frame(
      <>
        <h1 className="text-2xl font-semibold md:text-3xl">{name}</h1>
        <Card className="mt-5 p-5">
          <p className="flex items-center gap-3 text-sm font-medium" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden />
            Плащането е потвърдено. Подготвяме резултата.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Това отнема малко време. Страницата ще се обнови сама.
          </p>
        </Card>
      </>,
    );
  }

  if (phase.kind === "failed") {
    return frame(
      <>
        <h1 className="text-2xl font-semibold md:text-3xl">Не успяхме да завършим</h1>
        <p className="mt-3 text-muted-foreground">
          Опитайте отново след малко. Ако проблемът остане, {CONTACT}
        </p>
        <Button type="button" className="mt-6 min-h-11" onClick={reload}>
          Опитайте отново
        </Button>
      </>,
    );
  }

  if (phase.kind === "conflict") {
    return frame(
      <>
        <h1 className="text-2xl font-semibold md:text-3xl">Резултатът не съвпада с документа</h1>
        <p className="mt-3 text-muted-foreground">
          Документът се е променил след плащането, затова не показваме остарял резултат. {CONTACT}
        </p>
      </>,
    );
  }

  const { purchase, result } = phase;
  const row = purchase.entitlement;
  const title = result.payload.passport.title;
  // Успокоение „нищо не е намерено“ само при доказана проверка върху целия текст.
  const wholeDocumentCovered =
    result.payload.absence_checks.length > 0 &&
    result.payload.absence_checks.every((check) => check.coverage === "whole_document");

  const review = (
    <ReviewResult
      result={result}
      wholeDocumentCovered={wholeDocumentCovered}
      onFindingOpened={(severity) => trackFindingOpened(result.product_id, severity)}
    />
  );

  const reviewExport: ExportAction = {
    kind: "review_pdf",
    label: "Изтегли отчета от проверката (PDF)",
    filename: safeFileName(title, "proverka", "pdf"),
    build: () => buildReviewReportPdf(result),
  };

  const correctedExports: readonly ExportAction[] = manifest
    ? [
        {
          kind: "corrected_docx",
          label: "Поправен документ (DOCX)",
          filename: safeFileName(title, "popraven", "docx"),
          build: () => buildCorrectedDocx(title, manifest.corrected_text),
        },
        {
          kind: "corrected_pdf",
          label: "Поправен документ (PDF)",
          filename: safeFileName(title, "popraven", "pdf"),
          build: () => buildCorrectedPdf(title, manifest.corrected_text),
        },
        {
          kind: "change_report_pdf",
          label: "Отчет за промените (PDF)",
          filename: safeFileName(title, "promeni", "pdf"),
          build: () =>
            buildChangeReportPdf({
              title,
              applied: manifest.applied,
              rejected: manifest.rejected.map((id) => ({
                id,
                title:
                  result.product_id === "contract_check"
                    ? "Поправка"
                    : (result.payload.corrections.find((c) => c.id === id)?.title ?? "Поправка"),
              })),
              corrections:
                result.product_id === "contract_check" ? [] : result.payload.corrections,
            }),
        },
      ]
    : [];

  const correctionExportsSlot = manifest ? (
    <ExportBar
      title="Изтеглете поправения документ"
      note="Файлът съдържа текста с приетите поправки. Оформлението и таблиците от Вашия файл не се пренасят."
      actions={correctedExports}
      onCompleted={(kind) => trackExportCompleted(result.product_id, kind)}
    />
  ) : null;

  const workspace =
    result.product_id === "contract_check" ? null : (
      <CorrectionWorkspace
        corrections={result.payload.corrections}
        savedDecisions={state?.decisions ?? []}
        onSave={saveSelection}
        onDecision={(decision, strategy) =>
          trackCorrectionSelected(result.product_id, strategy ?? "none", decision)
        }
        onPreviewOpened={() => trackCorrectedPreviewOpened(result.product_id)}
        exportsSlot={correctionExportsSlot}
      />
    );

  const documentSlot = (
    <>
      {review}
      <ExportBar
        title="Изтегляне"
        actions={[reviewExport]}
        onCompleted={(kind) => trackExportCompleted(result.product_id, kind)}
      />
      {workspace}
    </>
  );

  return frame(
    <>
      <p className="text-sm text-muted-foreground">
        {isOneTimeProductId(row.product_id) ? getProduct(row.product_id).name : "Продукт"} ·{" "}
        {priceBg(row.amount_cents)}, еднократно
      </p>
      <div className="mt-4">
        {isProductResult(result, "negotiation_package") ? (
          <NegotiationWorkspace
            payload={result.payload}
            documentSlot={documentSlot}
            onRefine={refine}
            onRefinementSubmitted={trackRefinementSubmitted}
            exportsSlot={
              <ExportBar
                title="Материали за преговорите"
                actions={[
                  {
                    kind: "negotiation_brief_pdf",
                    label: "Записка за преговори (PDF)",
                    filename: safeFileName(title, "pregovori", "pdf"),
                    build: () => buildNegotiationBriefPdf(result),
                  },
                ]}
                onCompleted={(kind) => trackExportCompleted(result.product_id, kind)}
              />
            }
          />
        ) : (
          documentSlot
        )}
      </div>

      {isOneTimeProductId(row.product_id) && (
        <p className="mt-10 text-sm text-muted-foreground">
          <Link to={productPathById(row.product_id)} className="underline">
            Какво включва този продукт
          </Link>
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Ако работите с документи редовно,{" "}
        <Link
          to="/pricing"
          className="underline"
          onClick={() => trackQuietPlanLinkClicked(result.product_id)}
        >
          вижте плановете
        </Link>
        .
      </p>
    </>,
  );
}
