// Best-effort IndexNow ping. Tells Bing/Yandex/Seznam "these URLs changed,
// please recrawl". Google does not yet consume IndexNow but Bing does, and
// any Bing traffic helps a young domain.
//
// Runs at the end of `bun run build`. Safe to fail — never blocks the build.
//
// IndexNow protocol: https://www.indexnow.org/documentation
//
// Key is hosted at /<KEY>.txt with the same key string as its content (already
// committed under public/).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITE = "https://dogovori.net";
const KEY = "c8f3a9e2d14b4f0aa2e7c5d61b9f0a37";
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

async function main() {
  let sitemap = "";
  try {
    sitemap = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");
  } catch {
    console.warn("indexnow: sitemap.xml not found, skipping");
    return;
  }
  const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g))
    .map((m) => m[1])
    .filter((u) => u.startsWith(SITE));
  if (!urls.length) {
    console.warn("indexnow: no URLs in sitemap, skipping");
    return;
  }
  // IndexNow limit: 10,000 URLs per request.
  const batch = urls.slice(0, 10000);
  const body = {
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: batch,
  };
  try {
    const res = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    console.log(`indexnow: pinged ${batch.length} URLs → ${res.status} ${res.statusText}`);
  } catch (err) {
    console.warn("indexnow: ping failed (non-fatal):", (err as Error).message);
  }
}

main().catch((err) => {
  console.warn("indexnow: fatal (ignored):", err.message);
});
