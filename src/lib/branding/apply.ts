import { MARGIN_PT, BACKGROUND_HEX } from "./defaults";
import type { ResolvedBranding } from "./types";

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Пресметнати стойности за PDF/DOCX рендера на един брандинг профил. */
export interface BrandingLayout {
  margin: number;
  topPad: number;
  bottomPad: number;
  bodySize: number;
  headingSize: number;
  titleSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  accent: [number, number, number];
  text: [number, number, number];
  background: string;
  bodyAlign: "left" | "justify";
  headingAlign: "left" | "center";
  uppercaseHeadings: boolean;
  assetWidth: number;
}

const ASSET_WIDTH: Record<ResolvedBranding["signature"]["assetSize"], number> = {
  s: 110,
  m: 150,
  l: 190,
};

export function brandingLayout(b: ResolvedBranding | undefined): BrandingLayout {
  if (!b) {
    return {
      margin: 56,
      topPad: 0,
      bottomPad: 0,
      bodySize: 11,
      headingSize: 12,
      titleSize: 16,
      lineHeight: 1.4,
      paragraphSpacing: 8,
      accent: hexToRgb("#C9A84C"),
      text: [0, 0, 0],
      background: "#FFFFFF",
      bodyAlign: "justify",
      headingAlign: "left",
      uppercaseHeadings: true,
      assetWidth: 150,
    };
  }
  const headerLines =
    [b.header.companyName, b.header.address, [b.header.phone, b.header.email, b.header.website].filter(Boolean).join(" · ")]
      .filter(Boolean).length;
  const headerHeight = b.header.enabled
    ? Math.max(b.header.logoHeight, headerLines * 12) + 16
    : 0;
  const footerHeight = b.footer.enabled ? 26 : 0;

  return {
    margin: MARGIN_PT[b.formatting.margin],
    topPad: headerHeight,
    bottomPad: footerHeight,
    bodySize: b.typography.baseSize,
    headingSize: b.typography.headingSize,
    titleSize: b.typography.headingSize + 2,
    lineHeight: 1.25 * b.formatting.lineHeight,
    paragraphSpacing: b.formatting.paragraphSpacing,
    accent: hexToRgb(b.theme.accent),
    text: hexToRgb(b.theme.text),
    background: BACKGROUND_HEX[b.theme.background],
    bodyAlign: b.formatting.bodyAlign,
    headingAlign: b.formatting.headingAlign,
    uppercaseHeadings: b.formatting.uppercaseHeadings,
    assetWidth: ASSET_WIDTH[b.signature.assetSize],
  };
}

/** Редовете, които се изписват в хедъра (без логото). */
export function headerTextLines(b: ResolvedBranding): string[] {
  const h = b.header;
  const contact = [h.phone, h.email, h.website].filter(Boolean).join(" · ");
  const ids = [h.eik ? `ЕИК ${h.eik}` : "", h.vatNumber ? `ДДС ${h.vatNumber}` : ""]
    .filter(Boolean)
    .join(" · ");
  return [h.companyName, [h.address, ids].filter(Boolean).join(" · "), contact].filter(Boolean);
}

export function footerTextLines(b: ResolvedBranding): string[] {
  return [b.footer.line1, b.footer.line2].filter(Boolean);
}
