/**
 * OCR партида с ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ.
 *
 * ЦЕЛОСТ НА РЕЗУЛТАТА: партидата е всичко-или-нищо. Провалена страница
 * (изключение при заявката, не-2xx отговор, нечетим/липсващ JSON, празно
 * съдържание или изчерпан бюджет) прави ЦЯЛАТА партида несигурна. Никакъв
 * частичен текст не се потвърждава и не се таксува.
 *
 * `[OCR_UNREADABLE]` е ВАЛИДЕН резултат от модела — страницата се брои като
 * неразчетена, но партидата остава успешна.
 */

export class OcrBatchFailure extends Error {
  constructor(readonly pageIndex: number, override readonly cause: unknown) {
    super("ocr_batch_failed");
    this.name = "OcrBatchFailure";
  }
}

export interface OcrBatchInput {
  pageCount: number;
  concurrency?: number;
  /** Разчита ЕДНА страница. Хвърля при всяка несигурност. */
  readPage: (pageIndex: number) => Promise<string>;
}

/**
 * Изпълнява страниците с ограничена едновременност. При първи провал спира
 * подаването на нови страници и изчаква безопасно вече започналите, след което
 * хвърля `OcrBatchFailure`.
 */
export async function runOcrBatch(input: OcrBatchInput): Promise<string[]> {
  const total = Math.max(0, Math.floor(input.pageCount));
  const results: string[] = new Array(total).fill("");
  if (total === 0) return results;

  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, total));
  let nextIndex = 0;
  let firstFailure: OcrBatchFailure | null = null;

  const worker = async (): Promise<void> => {
    while (true) {
      if (firstFailure) return;
      const i = nextIndex++;
      if (i >= total) return;
      try {
        results[i] = await input.readPage(i);
      } catch (e) {
        if (!firstFailure) firstFailure = new OcrBatchFailure(i, e);
        return;
      }
    }
  };

  // allSettled: изчакваме всички работници, за да няма изоставени изключения.
  await Promise.allSettled(
    Array.from({ length: concurrency }, () => worker()),
  );

  if (firstFailure) throw firstFailure;
  return results;
}

/** Валидира съдържанието на ЕДНА страница. Празно/липсващо НЕ е успех. */
export function requireOcrPageContent(value: unknown): string {
  if (typeof value !== "string") throw new Error("ocr_page_content_missing");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("ocr_page_content_empty");
  return trimmed;
}
