import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dir, "..");
const out = resolve(root, "public/brand-kit");
mkdirSync(out, { recursive: true });

copyFileSync(resolve(root, "src/lib/brandGeometry.ts"), resolve(out, "brandGeometry.ts"));
copyFileSync(resolve(root, "scripts/brand-kit-reproduce.ts"), resolve(out, "reproduce.ts"));

const reproduce = spawnSync("bun", ["reproduce.ts"], { cwd: out, stdio: "inherit" });
if (reproduce.status !== 0) throw new Error("Standalone brand-kit reproduction failed");

// Public runtime derivatives: generated only from the canonical SVG geometry.
copyFileSync(resolve(out, "mark-navy.svg"), resolve(root, "public/brand-mark.svg"));
copyFileSync(resolve(out, "mark-white.svg"), resolve(root, "public/brand-mark-dark.svg"));
copyFileSync(resolve(out, "logo-light.svg"), resolve(root, "public/logo-horizontal.svg"));
copyFileSync(resolve(out, "logo-dark.svg"), resolve(root, "public/logo-horizontal-dark.svg"));
copyFileSync(resolve(out, "og1200x630.jpg"), resolve(root, "public/og-image.jpg"));
copyFileSync(resolve(out, "favicon-16.png"), resolve(root, "public/favicon-16.png"));
copyFileSync(resolve(out, "favicon-32.png"), resolve(root, "public/favicon-32.png"));
copyFileSync(resolve(out, "favicon.ico"), resolve(root, "public/favicon.ico"));
copyFileSync(resolve(out, "apple-touch-icon.png"), resolve(root, "public/apple-touch-icon.png"));
copyFileSync(resolve(out, "icon-192.png"), resolve(root, "public/icon-192.png"));
copyFileSync(resolve(out, "icon-512.png"), resolve(root, "public/icon-512.png"));
copyFileSync(resolve(out, "icon-maskable-192.png"), resolve(root, "public/icon-maskable-192.png"));
copyFileSync(resolve(out, "icon-maskable-512.png"), resolve(root, "public/icon-maskable-512.png"));
console.log("Brand kit generated from src/lib/brandGeometry.ts");
