import {
  BRANDING_SCHEMA_VERSION,
  type BrandingSettings,
} from "./types";

export const ACCENT_PALETTE = [
  { label: "Злато", value: "#B69A58" },
  { label: "Графит", value: "#2D3748" },
  { label: "Тъмносиньо", value: "#1E3A5F" },
  { label: "Смарагд", value: "#0D7A5F" },
  { label: "Бордо", value: "#7B2231" },
  { label: "Керемида", value: "#B45309" },
  { label: "Индиго", value: "#4338CA" },
  { label: "Черно", value: "#111111" },
] as const;

export const BACKGROUND_HEX: Record<BrandingSettings["theme"]["background"], string> = {
  white: "#FFFFFF",
  cream: "#FBF8F1",
  gray: "#F5F6F7",
};

export const MARGIN_PT: Record<BrandingSettings["formatting"]["margin"], number> = {
  narrow: 40,
  normal: 56,
  wide: 72,
};

export const FONT_LABEL: Record<BrandingSettings["typography"]["font"], string> = {
  sans: "Безсерифен (DejaVu Sans)",
  serif: "Серифен (DejaVu Serif)",
};

export const DEFAULT_BRANDING: BrandingSettings = {
  version: BRANDING_SCHEMA_VERSION,
  header: {
    enabled: true,
    logoPath: null,
    logoHeight: 32,
    companyName: "",
    eik: "",
    vatNumber: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    align: "split",
    rule: "accent",
    repeat: "first",
  },
  footer: {
    enabled: true,
    line1: "",
    line2: "",
    numbering: "full",
    showMadeWith: false,
  },
  signature: {
    layout: "two-columns",
    signaturePath: null,
    stampPath: null,
    assetSize: "m",
    caption: "(подпис и печат)",
    showCityDate: true,
  },
  theme: {
    accent: "#B69A58",
    text: "#111111",
    background: "white",
  },
  typography: {
    font: "sans",
    baseSize: 11,
    headingSize: 14,
  },
  formatting: {
    lineHeight: 1.15,
    paragraphSpacing: 8,
    clauseNumbering: "decimal",
    uppercaseHeadings: true,
    headingAlign: "left",
    bodyAlign: "justify",
    margin: "normal",
  },
};

export const cloneDefaultBranding = (): BrandingSettings =>
  JSON.parse(JSON.stringify(DEFAULT_BRANDING)) as BrandingSettings;
