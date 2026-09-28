import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Isolated build bundle: these aliases never affect the browser/Vite build. */
export async function buildLegalPages() {
  const outdir = mkdtempSync(join(tmpdir(), "dogovori-legal-ssr-"));
  try {
    const result = await Bun.build({
      entrypoints: [resolve("scripts/lib/legalSsrEntry.tsx")],
      outdir, target: "bun",
      plugins: [{
        name: "legal-static-chrome",
        setup(build) {
          build.onResolve({ filter: /^@\/(components\/(Header|Footer)|lib\/analytics)$/ }, () => ({
            path: resolve("scripts/lib/legalSsrStubs.tsx"),
          }));
        },
      }],
    });
    if (!result.success) throw new Error(`Legal SSR build failed: ${result.logs.join("\n")}`);
    const entry = result.outputs.find((output) => output.kind === "entry-point");
    if (!entry) throw new Error("Legal SSR entry point missing");
    const { renderLegalPages } = await import(pathToFileURL(entry.path).href);
    return renderLegalPages();
  } finally {
    // This exact directory was created above solely for the disposable bundle.
    rmSync(outdir, { recursive: true, force: true });
  }
}
