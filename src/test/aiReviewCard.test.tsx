/**
 * Q2d — РЕАЛЕН жизнен цикъл на картата „Автоматична AI ревизия".
 * Заявките са отложени обещания; никакви мрежови или AI повиквания.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/metrics", () => ({
  trackQualityReview: vi.fn(),
  trackQualityReviewFail: vi.fn(),
}));

const reviewDocument = vi.fn();
vi.mock("@/lib/documentReview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/documentReview")>();
  return { ...actual, reviewDocument: (...a: unknown[]) => reviewDocument(...a) };
});

import { AIReviewCard } from "@/components/wizard/AIReviewCard";
import { useReviewLifecycle } from "@/hooks/useReviewLifecycle";
import { REVIEW_SOURCE_VERSION } from "@/lib/reviewSnapshot";
import type { DocumentReview, ReviewOutcome } from "@/lib/documentReview";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const contract = (over: Record<string, unknown> = {}) => ({
  title: "Договор за услуги",
  preamble: "Днес, между страните, се сключи следният договор.",
  clauses: [{ number: "Чл. 1", title: "Предмет", body: "Изпълнителят предоставя услуги." }],
  closing: "Подписи на страните.",
  ...over,
});

const review = (over: Partial<DocumentReview> = {}): DocumentReview => ({
  verdict: "ready",
  confidence: 90,
  summary: "Няма отчетени пропуски",
  checks: [{ id: "forma_i_deystvitelnost", label: "Форма и действителност", status: "pass" }],
  missing_requisites: [],
  contradictions: [],
  unfilled_fields: [],
  legal_basis: [],
  source: { v: REVIEW_SOURCE_VERSION, digest: "D1" },
  completeness: { status: "complete", reasons: [] },
  ...over,
});

const outcome = (over: Partial<ReviewOutcome> = {}): ReviewOutcome => ({
  review: review(),
  error: null,
  requestedDigest: "D1",
  confirmationRequired: false,
  ...over,
});

beforeEach(() => {
  reviewDocument.mockReset();
});
afterEach(() => cleanup());

describe("AIReviewCard — реален жизнен цикъл", () => {
  it("първата автоматична заявка се показва (една заявка, и в StrictMode)", async () => {
    const d = deferred<ReviewOutcome>();
    reviewDocument.mockImplementation(() => d.promise);
    render(
      <StrictMode>
        <AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="dogovor-za-uslugi" />
      </StrictMode>,
    );
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Ревизията е в ход/)).toBeTruthy();

    await act(async () => {
      d.resolve(outcome());
    });
    expect(screen.queryByText(/Ревизията е в ход/)).toBeNull();
    expect(screen.getByText(/Документът преминава автоматичната ревизия/)).toBeTruthy();
    expect(reviewDocument).toHaveBeenCalledTimes(1);
  });

  it("редакция след резултат скрива присъдата и обяснява защо", async () => {
    const d1 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d1.promise);
    const view = render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await act(async () => {
      d1.resolve(outcome());
    });
    expect(screen.getByText(/Документът преминава автоматичната ревизия/)).toBeTruthy();

    const d2 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d2.promise);
    view.rerender(
      <AIReviewCard savedDocumentId="doc-1" contract={contract({ closing: "Различен край на документа." })} documentType="t" />,
    );
    expect(screen.queryByText(/Документът преминава автоматичната ревизия/)).toBeNull();
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(2));
    await act(async () => {
      d2.resolve(outcome({ review: review({ verdict: "needs_fixes" }) }));
    });
    expect(screen.getByText(/Ревизията откри места за прецизиране/)).toBeTruthy();
  });

  it("промяна САМО на приетия контекст обезсилва резултата", async () => {
    const d1 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d1.promise);
    const view = render(
      <AIReviewCard savedDocumentId="doc-1"
        contract={contract()}
        documentType="t"
        reviewContext={{ decisions: [{ label: "Срок", value: "12 месеца" }] }}
      />,
    );
    await act(async () => {
      d1.resolve(outcome());
    });
    expect(screen.getByText(/Документът преминава автоматичната ревизия/)).toBeTruthy();

    const d2 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d2.promise);
    view.rerender(
      <AIReviewCard savedDocumentId="doc-1"
        contract={contract()}
        documentType="t"
        reviewContext={{ role: "Изпълнител", decisions: [{ label: "Срок", value: "24 месеца" }] }}
      />,
    );
    expect(screen.queryByText(/Документът преминава автоматичната ревизия/)).toBeNull();
    expect(screen.getByText(/Документът е променен след последната проверка/)).toBeTruthy();
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(2));
    await act(async () => {
      d2.resolve(outcome());
    });
  });

  it("закъснял отговор от стара снимка не заменя новата заявка", async () => {
    const d1 = deferred<ReviewOutcome>();
    const d2 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    const view = render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(1));
    view.rerender(<AIReviewCard savedDocumentId="doc-1" contract={contract({ closing: "Нов край." })} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(2));

    // Старата заявка завършва ПОСЛЕДНА — не пипа нищо.
    await act(async () => {
      d2.resolve(outcome({ review: review({ verdict: "blocked" }) }));
    });
    await act(async () => {
      d1.resolve(outcome());
    });
    expect(screen.getByText(/Ревизията не може да потвърди документа/)).toBeTruthy();
    expect(screen.queryByText(/Документът преминава автоматичната ревизия/)).toBeNull();
  });

  it("отговор след напускане на екрана не хвърля и не се прилага", async () => {
    const d = deferred<ReviewOutcome>();
    reviewDocument.mockImplementation(() => d.promise);
    const view = render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => {
      d.resolve(outcome());
    });
    expect(screen.queryByText(/Документът преминава/)).toBeNull();
  });

  it("потвърждението е обвързано със същата снимка и редакция го отменя", async () => {
    const d1 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d1.promise);
    const view = render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await act(async () => {
      d1.resolve(
        outcome({ review: null, error: "Документът съдържа чувствителни данни.", confirmationRequired: true }),
      );
    });
    const btn = screen.getByRole("button", { name: /Потвърждавам и продължавам/ });

    const d2 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d2.promise);
    await act(async () => {
      btn.click();
    });
    expect(reviewDocument).toHaveBeenCalledTimes(2);
    expect(reviewDocument.mock.calls[1][0]).toMatchObject({ userConfirmed: true });
    await act(async () => {
      d2.resolve(outcome());
    });
    expect(screen.getByText(/Документът преминава автоматичната ревизия/)).toBeTruthy();

    // Нова снимка → потвърждението не се пренася.
    const d3 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d3.promise);
    view.rerender(<AIReviewCard savedDocumentId="doc-1" contract={contract({ closing: "Нов край." })} documentType="t" />);
    await act(async () => {
      d3.resolve(
        outcome({ review: null, error: "Документът съдържа чувствителни данни.", confirmationRequired: true }),
      );
    });
    const btn2 = screen.getByRole("button", { name: /Потвърждавам и продължавам/ });
    const d4 = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d4.promise);
    view.rerender(<AIReviewCard savedDocumentId="doc-1" contract={contract({ closing: "Още по-нов край." })} documentType="t" />);
    expect(screen.queryByRole("button", { name: /Потвърждавам и продължавам/ })).toBeNull();
    expect(btn2.isConnected).toBe(false);
    await act(async () => {
      d4.resolve(outcome());
    });
  });

  it("липсваща или непълна информация за обхвата не се показва като „готово“", async () => {
    const d = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d.promise);
    render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await act(async () => {
      d.resolve(outcome({ review: review({ completeness: null }) }));
    });
    expect(screen.queryByText(/Документът преминава автоматичната ревизия/)).toBeNull();
    expect(screen.getByText(/Ревизията откри места за прецизиране/)).toBeTruthy();
    expect(screen.getByText(/не съобщава колко от документа/)).toBeTruthy();
  });

  it("отговор с чужд отпечатък не се представя като проверен", async () => {
    const d = deferred<ReviewOutcome>();
    reviewDocument.mockImplementationOnce(() => d.promise);
    render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await act(async () => {
      d.resolve(outcome({ review: review({ source: { v: REVIEW_SOURCE_VERSION, digest: "ДРУГ" } }) }));
    });
    expect(screen.queryByText(/Документът преминава автоматичната ревизия/)).toBeNull();
    expect(screen.getByText(/Документът е променен след тази проверка/)).toBeTruthy();
  });

  it("провал в заявката се урежда — без вечно зареждане", async () => {
    reviewDocument.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    render(<AIReviewCard savedDocumentId="doc-1" contract={contract()} documentType="t" />);
    await waitFor(() => expect(screen.getByText(/Ревизията не можа да бъде извършена/)).toBeTruthy());
    expect(screen.queryByText(/Ревизията е в ход/)).toBeNull();
  });

  it("по-стар отговор за същата снимка не заменя по-новия (A→B→A и ръчно презареждане)", async () => {
    const dA1 = deferred<ReviewOutcome>();
    const dB = deferred<ReviewOutcome>();
    const dA2 = deferred<ReviewOutcome>();
    reviewDocument
      .mockImplementationOnce(() => dA1.promise)
      .mockImplementationOnce(() => dB.promise)
      .mockImplementationOnce(() => dA2.promise);

    const A = contract();
    const B = contract({ closing: "Различен край на документа." });
    const view = render(<AIReviewCard savedDocumentId="doc-1" contract={A} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(1));
    view.rerender(<AIReviewCard savedDocumentId="doc-1" contract={B} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(2));
    view.rerender(<AIReviewCard savedDocumentId="doc-1" contract={A} documentType="t" />);
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledTimes(3));

    // Най-новата заявка за A завършва първа и се показва.
    await act(async () => {
      dA2.resolve(outcome({ review: review({ verdict: "blocked" }) }));
    });
    expect(screen.getByText(/Ревизията не може да потвърди документа/)).toBeTruthy();

    // По-старите отговори за същата и за другата снимка не пипат нищо —
    // включително стара ГРЕШКА не изтрива успешния резултат.
    await act(async () => {
      dA1.resolve(outcome({ review: null, error: "стара грешка" }));
      dB.resolve(outcome());
    });
    expect(screen.getByText(/Ревизията не може да потвърди документа/)).toBeTruthy();
    expect(screen.queryByText(/стара грешка/)).toBeNull();
  });

});

describe("useReviewLifecycle — пореден номер на заявката", () => {
  it("две припокриващи се проверки за същата снимка: важи последната", async () => {
    const d1 = deferred<ReviewOutcome>();
    const d2 = deferred<ReviewOutcome>();
    const runner = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    const view = renderHook(() =>
      useReviewLifecycle({
        input: { documentText: "Текст на документа за проверка.", documentTitle: "Т" },
        runner,
        auto: false,
      }),
    );

    await act(async () => {
      view.result.current.run();
    });
    await act(async () => {
      view.result.current.run();
    });
    expect(runner).toHaveBeenCalledTimes(2);

    // Най-новата завършва първа.
    await act(async () => {
      d2.resolve(outcome({ review: review({ verdict: "needs_fixes" }) }));
    });
    expect(view.result.current.review?.verdict).toBe("needs_fixes");

    // По-старата (тук: грешка) не изтрива успеха.
    await act(async () => {
      d1.resolve(outcome({ review: null, error: "закъсняла грешка" }));
    });
    expect(view.result.current.review?.verdict).toBe("needs_fixes");
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.loading).toBe(false);
  });

  it("автоматичният старт остава ЕДИН, включително в StrictMode", async () => {
    const d = deferred<ReviewOutcome>();
    const runner = vi.fn().mockImplementation(() => d.promise);
    const view = renderHook(
      () =>
        useReviewLifecycle({
          input: { documentText: "Текст на документа за проверка.", documentTitle: "Т" },
          runner,
        }),
      { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> },
    );
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    await act(async () => {
      d.resolve(outcome());
    });
    expect(view.result.current.review?.verdict).toBe("ready");
    expect(runner).toHaveBeenCalledTimes(1);
  });
  it("без пропуск или запазен документ не пуска заявка и обяснява защо", async () => {
    const view = render(<AIReviewCard contract={contract()} documentType="t" />);
    expect(view.getByText(/Запазете документа/)).toBeTruthy();
    expect(view.queryByText(/Стартирай ревизия|Провери отново/)).toBeNull();
  });
});
