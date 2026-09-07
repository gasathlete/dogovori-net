/**
 * Генерира безплатните PDF наръчници в `public/lead-magnets/` от
 * декларативното съдържание в `src/lib/leadMagnetPdf/`.
 *
 *   bun run scripts/generate-lead-magnets.ts          # презаписва файловете
 *   bun run scripts/generate-lead-magnets.ts --check  # само проверява, че са актуални (CI)
 *
 * Изходът е детерминистичен: същото съдържание + същият шрифт → същите байтове.
 * Скриптът отказва да запише файл, ако рендерът върне предупреждения за
 * препълване или ако съдържанието включва забранена формулировка.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LEAD_MAGNET_SLUGS } from "../src/lib/leadMagnets";
import {
  LEAD_MAGNET_PDF_DOCUMENTS,
  collectLeadMagnetTexts,
  leadMagnetPublicPath,
} from "../src/lib/leadMagnetPdf/content";
import { LEAD_MAGNET_PDF_BANNED_PHRASES } from "../src/lib/leadMagnetPdf/common";
import { renderLeadMagnetPdf } from "../src/lib/leadMagnetPdf/render";

const ROOT = resolve(import.meta.dirname, "..");
const FONT_PATH = resolve(ROOT, "public/fonts/DejaVuSans.ttf");
const checkOnly = process.argv.includes("--check");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function main(): number {
  if (!existsSync(FONT_PATH)) {
    console.error(`Липсва шрифт: ${FONT_PATH}`);
    return 1;
  }
  const fontBase64 = readFileSync(FONT_PATH).toString("base64");
  let failures = 0;

  for (const slug of LEAD_MAGNET_SLUGS) {
    const def = LEAD_MAGNET_PDF_DOCUMENTS[slug];
    const outPath = resolve(ROOT, "public", leadMagnetPublicPath(slug).replace(/^\//, ""));

    // Одит на съдържанието преди рендер.
    const texts = collectLeadMagnetTexts(def).map((t) => t.toLowerCase());
    const banned = LEAD_MAGNET_PDF_BANNED_PHRASES.filter((p) => texts.some((t) => t.includes(p.toLowerCase())));
    if (banned.length) {
      console.error(`✗ ${slug}: забранени формулировки: ${banned.join(" | ")}`);
      failures++;
      continue;
    }

    const { bytes, pageCount, warnings } = renderLeadMagnetPdf(def, { fontBase64 });
    if (warnings.length) {
      console.error(`✗ ${slug}: предупреждения при рендер:\n  - ${warnings.join("\n  - ")}`);
      failures++;
      continue;
    }

    const digest = sha256(bytes);
    const existing = existsSync(outPath) ? new Uint8Array(readFileSync(outPath)) : null;
    const upToDate = existing !== null && sha256(existing) === digest;

    if (checkOnly) {
      if (upToDate) {
        console.log(`✓ ${slug}: актуален (${pageCount} стр., ${bytes.length} B, sha256 ${digest.slice(0, 12)}…)`);
      } else {
        console.error(`✗ ${slug}: ${outPath} не съответства на източника. Изпълнете: bun run scripts/generate-lead-magnets.ts`);
        failures++;
      }
      continue;
    }

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);
    console.log(
      `${upToDate ? "=" : "↻"} ${slug}: ${outPath.replace(ROOT + "/", "")} — ${pageCount} стр., ${bytes.length} B, sha256 ${digest}`,
    );
  }

  return failures ? 1 : 0;
}

process.exit(main());
