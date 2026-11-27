/**
 * Backwards-compatible barrel. New code should import from
 * `./exporterTypes` (types), `./exporters.pdf` (exportPDF), or
 * `./exporters.docx` (exportDOCX) so the bundler keeps each
 * heavy lib in its own chunk. Type-only imports from this file
 * remain free.
 */

export type {
  GeneratedContract,
  SignatureInfo,
  BilingualClause,
  WatermarkOpts,
} from "./exporterTypes";

export { exportPDF } from "./exporters.pdf";
export { exportDOCX } from "./exporters.docx";
