/**
 * Фокусирани тестове за платения резултат: точен достъп, честни състояния,
 * изричен избор, файлове и забранени фрази.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPaidAccessRequest, priceBg } from "@/lib/productPaidResult";
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
import { CorrectionWorkspace } from "@/components/product-result/CorrectionWorkspace";
import { NegotiationWorkspace } from "@/components/product-result/NegotiationWorkspace";
import type { ReadyProductResult } from "../../supabase/functions/_shared/product-result-contract";
import {
  CONTRACT_CHECK_FIXTURE,
  CONTRACT_IMPROVE_FIXTURE,
  NEGOTIATION_PACKAGE_FIXTURE,
} from "@/lib/productResultFixtures";

const BANNED = [
  "воден процес",
  "готови за поръчки",
  "скрити рискове",
  "без халюцинации",
  "магия",
  "революционен",
];

describe("точен достъп до платения резултат", () => {
  const session = `cs_test_${"a".repeat(24)}`;
  const uuid = "11111111-2222-4333-8444-555555555555";

  it("приема връщане от плащане по точна сесия", () => {
    const access = readPaidAccessRequest(new URLSearchParams({ session_id: session }));
    expect(access).toEqual({ mode: "checkout_return", sessionId: session });
  });

  it("приема собственик по точно право", () => {
    const access = readPaidAccessRequest(new URLSearchParams({ entitlement_id: uuid }));
    expect(access).toEqual({ mode: "owner", entitlementId: uuid });
  });

  it("отказва двусмислен и празен достъп — няма връщане към последната покупка", () => {
    expect(
      readPaidAccessRequest(new URLSearchParams({ session_id: session, entitlement_id: uuid })),
    ).toBeNull();
    expect(readPaidAccessRequest(new URLSearchParams())).toBeNull();
    expect(readPaidAccessRequest(new URLSearchParams({ session_id: "cs_test_x" }))).toBeNull();
    expect(readPaidAccessRequest(new URLSearchParams({ entitlement_id: "not-a-uuid" }))).toBeNull();
  });

  it("цените са с българска запетая", () => {
    expect(priceBg(299)).toBe("2,99 €");
    expect(priceBg(799)).toBe("7,99 €");
  });
});

describe("подробната проверка", () => {
  it("показва заключение, находки с извадка и място", () => {
    render(<ReviewResult result={CONTRACT_CHECK_FIXTURE} wholeDocumentCovered={false} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const finding = CONTRACT_CHECK_FIXTURE.payload.findings[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(finding.title, "i") }));
    expect(screen.getByText(finding.consequence)).toBeInTheDocument();
    expect(screen.getByText(finding.next_step)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(finding.span.excerpt.slice(0, 20)))).toBeInTheDocument();
  });

  it("успокоява за целия документ само когато проверката го покрива", () => {
    const empty = {
      ...CONTRACT_CHECK_FIXTURE,
      payload: { ...CONTRACT_CHECK_FIXTURE.payload, findings: [], priority_summary: [] },
    };
    const { unmount } = render(<ReviewResult result={empty} wholeDocumentCovered={false} />);
    expect(screen.getByText("Няма находки за показване.")).toBeInTheDocument();
    unmount();
    render(<ReviewResult result={empty} wholeDocumentCovered />);
    expect(screen.getByText(/обхвана целия документ/)).toBeInTheDocument();
  });

  it("не използва забранени фрази", () => {
    const { container } = render(
      <ReviewResult result={CONTRACT_CHECK_FIXTURE} wholeDocumentCovered={false} />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const phrase of BANNED) expect(text).not.toContain(phrase);
  });
});

describe("изборът по поправките", () => {
  const corrections = CONTRACT_IMPROVE_FIXTURE.payload.corrections;

  it("не записва нищо, докато всяка поправка не е решена изрично", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, correctedText: "поправен текст" });
    render(
      <CorrectionWorkspace corrections={corrections} savedDecisions={[]} onSave={onSave} />,
    );
    const save = screen.getByRole("button", { name: "Запиши избора" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Приеми всички с избрания подход" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = onSave.mock.calls[0][0] as { decision: string }[];
    expect(sent).toHaveLength(corrections.length);
    expect(sent.every((d) => d.decision === "accept")).toBe(true);
    expect(await screen.findByText("Изборът е записан.")).toBeInTheDocument();
  });

  it("показва ясно съобщение при разминаване на версията", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: "Изборът е бил променен." });
    render(
      <CorrectionWorkspace corrections={corrections} savedDecisions={[]} onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Приеми всички с избрания подход" }));
    fireEvent.click(screen.getByRole("button", { name: "Запиши избора" }));
    expect(await screen.findByText("Изборът е бил променен.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Виж поправения документ/ })).toBeNull();
  });

  it("показва реално Преди и След от избрания вариант", () => {
    render(
      <CorrectionWorkspace
        corrections={corrections}
        savedDecisions={[
          { correction_id: corrections[0].id, decision: "accept", strategy: "conservative" },
        ]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Преди")).toBeInTheDocument();
    expect(screen.getByText("След")).toBeInTheDocument();
    const option = corrections[0].options.find((o) => o.stance === "conservative");
    expect(screen.getAllByText(option?.replacement_text ?? "").length).toBeGreaterThan(0);
  });
});

describe("пакетът за преговори", () => {
  it("дава раздели, писма за копиране и едно уточнение", async () => {
    const user = userEvent.setup();
    const onRefine = vi.fn().mockResolvedValue({ ok: true });
    render(
      <NegotiationWorkspace
        payload={NEGOTIATION_PACKAGE_FIXTURE.payload}
        documentSlot={<p>Документът</p>}
        onRefine={onRefine}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Съобщения" }));
    expect(await screen.findByText("Неутрално писмо")).toBeInTheDocument();
    expect(screen.getByText("Твърдо писмо")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Копирай текста/ })).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Уточнение" }));
    const submit = await screen.findByRole("button", { name: "Поискай уточнението" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Какво да прецизираме"), {
      target: { value: "Съкратете писмото и наблегнете на срока за плащане." },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onRefine).toHaveBeenCalledTimes(1));
  });

  it("казва честно, когато уточнението е използвано", async () => {
    const user = userEvent.setup();
    render(
      <NegotiationWorkspace
        payload={{
          ...NEGOTIATION_PACKAGE_FIXTURE.payload,
          refinement: { included: 1, used: 1 },
        }}
        documentSlot={null}
        onRefine={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Уточнение" }));
    expect(screen.getByText(/вече е използвано \(1 от 1\)/)).toBeInTheDocument();
  });
});

describe("файловете", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("имената са безопасни", () => {
    expect(safeFileName("../Договор: наем", "proverka", "pdf")).toBe("Договор_наем_proverka.pdf");
    expect(safeFileName("///", "x", "docx")).toBe("Dokument_x.docx");
  });

  it("отчетът от проверката е PDF с съдържание", async () => {
    const blob = await buildReviewReportPdf(CONTRACT_CHECK_FIXTURE);
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toContain("pdf");
  });

  it("поправеният документ се създава като DOCX и PDF", async () => {
    const text = "Член 1. Текст на документа.\n\nЧлен 2. Друг текст.";
    const docx = await buildCorrectedDocx("Договор", text);
    const pdf = await buildCorrectedPdf("Договор", text);
    expect(docx.size).toBeGreaterThan(500);
    expect(pdf.size).toBeGreaterThan(500);
  });

  it("отчетът за промените и записката за преговори се създават", async () => {
    const corrections = CONTRACT_IMPROVE_FIXTURE.payload.corrections;
    const first = corrections[0];
    const option = first.options[0];
    const report = await buildChangeReportPdf({
      title: "Договор",
      applied: [
        {
          correction_id: first.id,
          mode: first.mode,
          strategy: option.stance,
          original_start: first.span.start,
          original_end: first.span.end,
          original_text: first.original_text,
          replacement_text: option.replacement_text,
        },
      ],
      rejected: [{ id: "c-2", title: "Друга поправка" }],
      corrections,
    });
    expect(report.size).toBeGreaterThan(800);
    const brief = await buildNegotiationBriefPdf(NEGOTIATION_PACKAGE_FIXTURE);
    expect(brief.size).toBeGreaterThan(800);
  });

  it("проверката за продукт пази от грешен файл", () => {
    const check = CONTRACT_CHECK_FIXTURE as unknown as ReadyProductResult;
    const pack = NEGOTIATION_PACKAGE_FIXTURE as unknown as ReadyProductResult;
    expect(isProductResult(check, "negotiation_package")).toBe(false);
    expect(isProductResult(pack, "negotiation_package")).toBe(true);
  });
});
