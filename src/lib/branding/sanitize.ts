import { BRANDING_SCHEMA_VERSION, type BrandingSettings } from "./types";
import { DEFAULT_BRANDING, cloneDefaultBranding } from "./defaults";

const str = (v: unknown, fallback = "", max = 200): string =>
  typeof v === "string" ? v.slice(0, max) : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;

const hex = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;

/**
 * Приема произволен JSONB от базата и връща валиден, пълен обект с настройки.
 * Липсващи или повредени полета падат обратно към стойностите по подразбиране.
 */
export function sanitizeBranding(raw: unknown): BrandingSettings {
  const d = DEFAULT_BRANDING;
  if (!raw || typeof raw !== "object") return cloneDefaultBranding();
  const r = raw as Record<string, any>;
  const h = (r.header ?? {}) as Record<string, any>;
  const f = (r.footer ?? {}) as Record<string, any>;
  const s = (r.signature ?? {}) as Record<string, any>;
  const t = (r.theme ?? {}) as Record<string, any>;
  const ty = (r.typography ?? {}) as Record<string, any>;
  const fm = (r.formatting ?? {}) as Record<string, any>;

  return {
    version: BRANDING_SCHEMA_VERSION,
    header: {
      enabled: bool(h.enabled, d.header.enabled),
      logoPath: typeof h.logoPath === "string" ? h.logoPath.slice(0, 300) : null,
      logoHeight: oneOf(h.logoHeight, [24, 32, 40] as const, d.header.logoHeight),
      companyName: str(h.companyName, d.header.companyName, 120),
      eik: str(h.eik, d.header.eik, 30),
      vatNumber: str(h.vatNumber, d.header.vatNumber, 30),
      address: str(h.address, d.header.address, 160),
      phone: str(h.phone, d.header.phone, 40),
      email: str(h.email, d.header.email, 120),
      website: str(h.website, d.header.website, 120),
      align: oneOf(h.align, ["left", "center", "split"] as const, d.header.align),
      rule: oneOf(h.rule, ["none", "thin", "accent"] as const, d.header.rule),
      repeat: oneOf(h.repeat, ["first", "all"] as const, d.header.repeat),
    },
    footer: {
      enabled: bool(f.enabled, d.footer.enabled),
      line1: str(f.line1, d.footer.line1, 160),
      line2: str(f.line2, d.footer.line2, 160),
      numbering: oneOf(f.numbering, ["none", "short", "full"] as const, d.footer.numbering),
      showMadeWith: bool(f.showMadeWith, d.footer.showMadeWith),
    },
    signature: {
      layout: oneOf(s.layout, ["two-columns", "right", "left"] as const, d.signature.layout),
      signaturePath: typeof s.signaturePath === "string" ? s.signaturePath.slice(0, 300) : null,
      stampPath: typeof s.stampPath === "string" ? s.stampPath.slice(0, 300) : null,
      assetSize: oneOf(s.assetSize, ["s", "m", "l"] as const, d.signature.assetSize),
      caption: str(s.caption, d.signature.caption, 80),
      showCityDate: bool(s.showCityDate, d.signature.showCityDate),
    },
    theme: {
      accent: hex(t.accent, d.theme.accent),
      text: hex(t.text, d.theme.text),
      background: oneOf(t.background, ["white", "cream", "gray"] as const, d.theme.background),
    },
    typography: {
      font: oneOf(ty.font, ["sans", "serif"] as const, d.typography.font),
      baseSize: oneOf(ty.baseSize, [10, 11, 12] as const, d.typography.baseSize),
      headingSize: oneOf(ty.headingSize, [12, 14, 16] as const, d.typography.headingSize),
    },
    formatting: {
      lineHeight: oneOf(fm.lineHeight, [1, 1.15, 1.5] as const, d.formatting.lineHeight),
      paragraphSpacing:
        typeof fm.paragraphSpacing === "number" && fm.paragraphSpacing >= 0 && fm.paragraphSpacing <= 24
          ? fm.paragraphSpacing
          : d.formatting.paragraphSpacing,
      clauseNumbering: oneOf(
        fm.clauseNumbering,
        ["decimal", "nested", "article"] as const,
        d.formatting.clauseNumbering,
      ),
      uppercaseHeadings: bool(fm.uppercaseHeadings, d.formatting.uppercaseHeadings),
      headingAlign: oneOf(fm.headingAlign, ["left", "center"] as const, d.formatting.headingAlign),
      bodyAlign: oneOf(fm.bodyAlign, ["left", "justify"] as const, d.formatting.bodyAlign),
      margin: oneOf(fm.margin, ["narrow", "normal", "wide"] as const, d.formatting.margin),
    },
  };
}
