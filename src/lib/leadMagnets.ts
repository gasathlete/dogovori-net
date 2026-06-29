/**
 * Lead magnets catalog. Files are static PDFs in /public/lead-magnets/ so
 * downloads are instant and no edge function is needed.
 */
export interface LeadMagnet {
  slug: string;
  title: string;
  subtitle: string;
  /** Public URL of the PDF */
  fileUrl: string;
  /** Eyebrow chip text */
  eyebrow: string;
  /** What's inside — 3 bullets max */
  bullets: string[];
}

export const LEAD_MAGNETS: Record<string, LeadMagnet> = {
  rent: {
    slug: "rent-red-flags",
    title: "10 червени флага в договор за наем",
    subtitle: "Безплатен PDF наръчник — какво да провериш преди да подпишеш",
    fileUrl: "/lead-magnets/10-cherveni-flaga-dogovor-za-naem.pdf",
    eyebrow: "За наематели и наемодатели",
    bullets: [
      "10 конкретни клаузи, които често крият проблеми",
      "Какво да поискаш от другата страна — с примерен текст",
      "Кога си струва правна консултация и кога не",
    ],
  },
  labor: {
    slug: "labor-checklist-2026",
    title: "Чек-лист: Трудов договор 2026",
    subtitle: "12 задължителни проверки преди да подпишеш по КТ",
    fileUrl: "/lead-magnets/chek-list-truddoven-dogovor-2026.pdf",
    eyebrow: "Актуален за 2026 г.",
    bullets: [
      "Какво е задължително според Кодекса на труда",
      "Кога работодателят надхвърля закона — и какво да направиш",
      "Образец на писмо за корекция (готов за изпращане)",
    ],
  },
};

export function pickLeadMagnetByContext(): LeadMagnet {
  // Heuristic — pick by current route/query for relevance.
  if (typeof window === "undefined") return LEAD_MAGNETS.rent;
  const path = window.location.pathname.toLowerCase();
  if (path.includes("trud") || path.includes("labor") || path.includes("rabot"))
    return LEAD_MAGNETS.labor;
  return LEAD_MAGNETS.rent;
}
