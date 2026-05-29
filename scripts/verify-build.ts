// Post-build sanity check.
// Fails the build if SEO-critical files are missing from dist/.
//
// Usage: bun run scripts/verify-build.ts

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");
const required = [
  {
    path: "sitemap.xml",
    minBytes: 500,
    validate: (content: string) => content.includes("<urlset") || content.includes("<sitemapindex"),
    errorMessage: 'missing either "<urlset" or "<sitemapindex"',
  },
  { path: "robots.txt", minBytes: 20, mustContain: "Sitemap:" },
  { path: "index.html", minBytes: 500, mustContain: "<html" },
];

let failed = false;
for (const f of required) {
  const full = resolve(DIST, f.path);
  if (!existsSync(full)) {
    console.error(`✗ MISSING: dist/${f.path}`);
    failed = true;
    continue;
  }
  const size = statSync(full).size;
  if (size < f.minBytes) {
    console.error(`✗ TOO SMALL: dist/${f.path} (${size} bytes, expected ≥ ${f.minBytes})`);
    failed = true;
    continue;
  }
  if ("mustContain" in f && f.mustContain) {
    const content = readFileSync(full, "utf8");
    if (!content.includes(f.mustContain)) {
      console.error(`✗ INVALID: dist/${f.path} missing "${f.mustContain}"`);
      failed = true;
      continue;
    }
  }
  if ("validate" in f && f.validate) {
    const content = readFileSync(full, "utf8");
    if (!f.validate(content)) {
      console.error(`✗ INVALID: dist/${f.path} ${f.errorMessage}`);
      failed = true;
      continue;
    }
  }
  console.log(`✓ dist/${f.path} (${size} bytes)`);
}

if (failed) {
  console.error("\nBuild verification FAILED. Refusing to publish broken artifacts.");
  process.exit(1);
}
console.log("\n✓ Build artifacts verified.");
