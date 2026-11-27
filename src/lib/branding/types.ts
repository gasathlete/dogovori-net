/**
 * Персонално брандиране — схема на настройките.
 * Пази се като JSONB в `branding_profiles.settings`.
 * Всяка промяна на схемата вдига `BRANDING_SCHEMA_VERSION` и се мигрира в
 * `sanitizeBranding`, за да не чупи вече запазени профили.
 */

export const BRANDING_SCHEMA_VERSION = 1;

export type HeaderAlign = "left" | "center" | "split";
export type HeaderRule = "none" | "thin" | "accent";
export type HeaderRepeat = "first" | "all";
export type PageNumbering = "none" | "short" | "full";
export type SignatureLayout = "two-columns" | "right" | "left";
export type AssetSize = "s" | "m" | "l";
export type FontKey = "sans" | "serif";
export type ClauseNumbering = "decimal" | "nested" | "article";
export type BodyAlign = "left" | "justify";
export type PageMargin = "narrow" | "normal" | "wide";
export type Background = "white" | "cream" | "gray";

export interface BrandingHeader {
  enabled: boolean;
  logoPath: string | null;
  logoHeight: 24 | 32 | 40;
  companyName: string;
  eik: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  align: HeaderAlign;
  rule: HeaderRule;
  repeat: HeaderRepeat;
}

export interface BrandingFooter {
  enabled: boolean;
  line1: string;
  line2: string;
  numbering: PageNumbering;
  showMadeWith: boolean;
}

export interface BrandingSignature {
  layout: SignatureLayout;
  signaturePath: string | null;
  stampPath: string | null;
  assetSize: AssetSize;
  caption: string;
  showCityDate: boolean;
}

export interface BrandingTheme {
  accent: string;
  text: string;
  background: Background;
}

export interface BrandingTypography {
  font: FontKey;
  baseSize: 10 | 11 | 12;
  headingSize: 12 | 14 | 16;
}

export interface BrandingFormatting {
  lineHeight: 1 | 1.15 | 1.5;
  paragraphSpacing: number;
  clauseNumbering: ClauseNumbering;
  uppercaseHeadings: boolean;
  headingAlign: "left" | "center";
  bodyAlign: BodyAlign;
  margin: PageMargin;
}

export interface BrandingSettings {
  version: number;
  header: BrandingHeader;
  footer: BrandingFooter;
  signature: BrandingSignature;
  theme: BrandingTheme;
  typography: BrandingTypography;
  formatting: BrandingFormatting;
}

/** Настройки заедно с вече заредените изображения (data URL). */
export interface ResolvedBranding extends BrandingSettings {
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
  stampDataUrl?: string | null;
}
