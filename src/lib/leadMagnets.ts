/**
 * Lead magnets catalog. Files are static PDFs in /public/lead-magnets/ so
 * downloads are instant and no edge function is needed.
 *
 * Свалянето е директно и НЕ изисква имейл. Абонаментът за бюлетина е отделна,
 * незадължителна стъпка (виж `subscribeToLeadMagnetNewsletter`).
 */
export interface LeadMagnet {
  slug: LeadMagnetSlug;
  title: string;
  subtitle: string;
  /** Public URL of the PDF */
  fileUrl: string;
  /** Eyebrow chip text */
  eyebrow: string;
  /** What's inside — 3 bullets max */
  bullets: string[];
}

/** Единствените slug-ове, които сървърният RPC приема (allow-list). */
export const LEAD_MAGNET_SLUGS = ["rent-red-flags", "labor-checklist-2026"] as const;
export type LeadMagnetSlug = (typeof LEAD_MAGNET_SLUGS)[number];

/**
 * Версия на текста на съгласието за бюлетина. Записва се сървърно в
 * `consent_version` при всеки абонамент — промяна на формулировката = нова версия.
 */
export const LEAD_MAGNET_CONSENT_VERSION = "lead-magnet-v2";

export function isLeadMagnetSlug(value: unknown): value is LeadMagnetSlug {
  return typeof value === "string" && (LEAD_MAGNET_SLUGS as readonly string[]).includes(value);
}

export const LEAD_MAGNETS: Record<"rent" | "labor", LeadMagnet> = {
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

/**
 * Избор по контекст — само по текущия път, без да го записваме никъде.
 * @param pathname по подразбиране текущият `window.location.pathname`
 */
export function pickLeadMagnetByContext(pathname?: string): LeadMagnet {
  const path = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")).toLowerCase();
  if (path.includes("trud") || path.includes("labor") || path.includes("rabot")) return LEAD_MAGNETS.labor;
  return LEAD_MAGNETS.rent;
}
