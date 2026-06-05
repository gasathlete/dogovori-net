export type FieldNumber = {
  key: string;
  label: string;
  type: "number";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  help?: string;
};
export type FieldDate = {
  key: string;
  label: string;
  type: "date";
  default?: string;
  help?: string;
};
export type FieldSelect = {
  key: string;
  label: string;
  type: "select";
  options: { value: string; label: string }[];
  default?: string;
  help?: string;
};
export type Field = FieldNumber | FieldDate | FieldSelect;

export type CalcResult = {
  main: { label: string; value: string };
  breakdown: { label: string; value: string }[];
  notes?: string[];
};

export type Calculator = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string; // lucide icon name (PascalCase)
  fields: Field[];
  compute: (input: Record<string, any>) => CalcResult;
  legalBasis: { label: string; url: string }[];
  seo: {
    metaDescription: string;
    intro: string;
    howItWorks: string;
    faq: { q: string; a: string }[];
  };
};

export const fmtEUR = (n: number): string =>
  new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Math.max(0, n));

export const fmtNum = (n: number, digits = 2): string =>
  new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
