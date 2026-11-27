/**
 * Типове за съдържанието на безплатните PDF наръчници (lead magnets).
 *
 * Съдържанието е декларативно (данни, не JSX), за да може:
 *  - да се рендира детерминистично от `scripts/generate-lead-magnets.ts`;
 *  - да се одитира автоматично в тестовете (забранени формулировки,
 *    задължителни цитати, официални източници, disclaimer).
 */
import type { LeadMagnetSlug } from "../leadMagnets";

/** Официален източник, посочен в раздела „Официални източници“. */
export interface PdfSource {
  /** Кратко описание — какво е проверено там. */
  label: string;
  /** Пълен https адрес на официалната публикация. */
  url: string;
}

export type PdfBlock =
  | {
      kind: "paragraph";
      text: string;
      /** `muted` — второстепенен текст; `emphasis` — леко удебелен. */
      tone?: "body" | "muted" | "emphasis";
    }
  | {
      kind: "callout";
      /** `law` — „Какво казва законът“; `warning` — предупреждение; `tip` — практичен съвет. */
      variant: "law" | "warning" | "tip";
      title?: string;
      text: string;
    }
  | {
      kind: "checklist";
      title?: string;
      items: string[];
    }
  | {
      kind: "bullets";
      title?: string;
      items: string[];
    }
  | {
      /** Полета за ръчно попълване с линия. */
      kind: "fields";
      title?: string;
      items: string[];
    }
  | {
      /** Примерна формулировка / образец на писмо в рамка. */
      kind: "template";
      title: string;
      lines: string[];
      note?: string;
    };

export interface PdfSection {
  /** Пореден номер (1..N). Разделите без номер (адвокат, източници) се описват отделно. */
  number: number;
  title: string;
  /** Кратко въведение „защо е риск / какво изисква законът“. */
  lead: string;
  blocks: PdfBlock[];
}

export interface PdfCta {
  title: string;
  text: string;
  /** Показва се като текст и е кликаем линк. */
  url: string;
  /** Честна бележка за ограниченията на инструмента. */
  note: string;
}

export interface LeadMagnetPdfDocument {
  slug: LeadMagnetSlug;
  /** Малък надпис над заглавието на корицата. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Въвеждащи абзаци на първа страница. */
  intro: string[];
  /** Кратко „как да използвате наръчника“. */
  howToUse: string;
  /** Заглавие на основния списък (напр. „10-те червени флага“). */
  sectionsHeading: string;
  sections: PdfSection[];
  /** Незадължителни допълнителни блокове след основните раздели (напр. образец на имейл). */
  appendix?: { title: string; blocks: PdfBlock[] };
  whenLawyer: { title: string; intro: string; items: string[]; outro: string };
  sources: { title: string; intro: string; items: PdfSource[] };
  cta: PdfCta;
  metadata: { subject: string; keywords: string[] };
}
