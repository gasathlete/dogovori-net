import { obezshtetenieUvolnenie } from "./obezshtetenie-uvolnenie";
import { obezshtetenieBezrabotitsa } from "./obezshtetenie-bezrabotitsa";
import { platenOtpusk } from "./platen-otpusk";
import { lihvaZabava } from "./lihva-zabava";
import { notarialnaTaksa } from "./notarialna-taksa";
import { ddsKalkulator } from "./dds-kalkulator";
import { mestniDanatsi } from "./mestni-danatsi";
import { predizvestieKt } from "./predizvestie-kt";
import type { Calculator } from "./types";

export const CALCULATORS: Calculator[] = [
  obezshtetenieUvolnenie,
  platenOtpusk,
  obezshtetenieBezrabotitsa,
  lihvaZabava,
  notarialnaTaksa,
  ddsKalkulator,
  mestniDanatsi,
  predizvestieKt,
];

export const getCalculator = (slug: string): Calculator | undefined =>
  CALCULATORS.find((c) => c.slug === slug);

export type { Calculator } from "./types";
