import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  BRAND_COLORS,
  BRAND_FRAME_PATHS,
  BRAND_LOGO_VIEWBOX,
  BRAND_MARK_VIEWBOX,
  BRAND_MONOGRAM_PATHS,
  BRAND_MONOGRAM_TRANSFORM,
  BRAND_SCALE_PATHS,
  BRAND_WORDMARK_PATHS,
  BRAND_WORDMARK_TRANSFORM,
} from "./brandGeometry";

const out = import.meta.dir;
const paths = (items: readonly string[], fill: string) => items.map((d) => `<path fill="${fill}" d="${d}"/>`).join("");
const markBody = (color: string, detail = true) => `${paths(BRAND_FRAME_PATHS, color)}<g transform="${BRAND_MONOGRAM_TRANSFORM}">${paths(BRAND_MONOGRAM_PATHS, color)}</g>${detail ? paths(BRAND_SCALE_PATHS, color) : ""}`;
const wordmarkBody = (color: string) => paths(BRAND_WORDMARK_PATHS, color);
const svg = (viewBox: string, body: string, label = "Договори.нет") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>\n`;
const logoBody = (fore: string, markColor = BRAND_COLORS.gold) => `<g>${markBody(markColor)}</g><g transform="${BRAND_WORDMARK_TRANSFORM}">${wordmarkBody(fore)}</g>`;
const logo = (fore: string) => svg(BRAND_LOGO_VIEWBOX, logoBody(fore));
const mark = (color: string, detail = true) => svg(BRAND_MARK_VIEWBOX, markBody(color, detail));

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: out, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed: ${args.join(" ")}`);
}

function magick(args: string[]) {
  run("magick", args);
}

function render(source: string, destination: string, width: number, height: number, background = "none") {
  magick(["-background", background, resolve(out, source), "-resize", `${width}x${height}`, "-gravity", "center", "-extent", `${width}x${height}`, resolve(out, destination)]);
}

writeFileSync(resolve(out, "logo-light.svg"), logo(BRAND_COLORS.navy));
writeFileSync(resolve(out, "logo-dark.svg"), logo(BRAND_COLORS.ivory));
writeFileSync(resolve(out, "mark-gold.svg"), mark(BRAND_COLORS.gold));
writeFileSync(resolve(out, "mark-navy.svg"), mark(BRAND_COLORS.navy));
writeFileSync(resolve(out, "mark-white.svg"), mark(BRAND_COLORS.ivory));
writeFileSync(resolve(out, "logo-mono.svg"), svg(BRAND_LOGO_VIEWBOX, logoBody("#000000", "#000000")));
writeFileSync(resolve(out, "mark-mini.svg"), mark(BRAND_COLORS.gold, false));

render("logo-light.svg", "logo-light@2x.png", 2816, 560);
render("logo-dark.svg", "logo-dark@2x.png", 2816, 560);
render("mark-gold.svg", "icon512.png", 512, 512);
render("mark-gold.svg", "avatar-light1024.png", 1024, 1024, BRAND_COLORS.ivory);
render("mark-gold.svg", "avatar-dark1024.png", 1024, 1024, BRAND_COLORS.navy);

const ogSvg = svg("0 0 1200 630", `<path fill="${BRAND_COLORS.navy}" d="M0 0H1200V630H0Z"/><g transform="translate(80 211) scale(.74)">${logoBody(BRAND_COLORS.ivory)}</g>`);
writeFileSync(resolve(out, "og1200x630.svg"), ogSvg);
magick([resolve(out, "og1200x630.svg"), "-quality", "92", resolve(out, "og1200x630.jpg")]);

render("mark-mini.svg", "favicon-16.png", 16, 16, BRAND_COLORS.navy);
render("mark-mini.svg", "favicon-32.png", 32, 32, BRAND_COLORS.navy);
magick([resolve(out, "favicon-16.png"), resolve(out, "favicon-32.png"), "-define", "icon:auto-resize=16,32,48", resolve(out, "favicon.ico")]);
render("mark-gold.svg", "apple-touch-icon.png", 180, 180, BRAND_COLORS.navy);
render("mark-gold.svg", "icon-192.png", 192, 192, BRAND_COLORS.navy);
render("mark-gold.svg", "icon-512.png", 512, 512, BRAND_COLORS.navy);
render("mark-gold.svg", "icon-maskable-192.png", 150, 150, BRAND_COLORS.navy);
magick(["-background", BRAND_COLORS.navy, resolve(out, "icon-maskable-192.png"), "-gravity", "center", "-extent", "192x192", resolve(out, "icon-maskable-192.png")]);
render("mark-gold.svg", "icon-maskable-512.png", 400, 400, BRAND_COLORS.navy);
magick(["-background", BRAND_COLORS.navy, resolve(out, "icon-maskable-512.png"), "-gravity", "center", "-extent", "512x512", resolve(out, "icon-maskable-512.png")]);

const readme = `# Бранд пакет на Договори.нет

Одобрена версия: кирилски монограм „ДН“ в прекъсната геометрична рамка.

## Цветове
- Gold: ${BRAND_COLORS.gold}
- Navy: ${BRAND_COLORS.navy}
- Ivory: ${BRAND_COLORS.ivory}

## Употреба
- logo-light: за светъл фон; logo-dark: за тъмен фон.
- mark-gold/navy/white: самостоятелен знак.
- logo-mono: едноцветен печат.
- mark-mini и favicon-16/32: малък размер без миниатюрната везна.
- Не разтягайте, не променяйте цветовете и пазете свободно поле поне 1/4 от височината на знака.

## Самостоятелно възпроизвеждане
Необходими са Bun, ImageMagick (командата \`magick\`) и \`zip\`. Разархивирайте пакета в произволна празна директория, отворете терминал в нея и изпълнете точно:

\`\`\`sh
bun reproduce.ts
\`\`\`

Скриптът използва само включения \`brandGeometry.ts\`, записва само в текущата директория и пресъздава SVG, PNG, ICO, наръчника и ZIP пакета.
`;
writeFileSync(resolve(out, "README.md"), readme);

const guide = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Договори.нет — визуален бранд наръчник</title><style>:root{--gold:${BRAND_COLORS.gold};--navy:${BRAND_COLORS.navy};--ivory:${BRAND_COLORS.ivory}}*{box-sizing:border-box}body{margin:0;background:var(--ivory);color:var(--navy);font:16px/1.55 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 24px}h1,h2{letter-spacing:0}.download{display:inline-block;margin:12px 0 28px;padding:12px 18px;background:var(--navy);color:var(--ivory);text-decoration:none}.download:focus-visible{outline:3px solid var(--gold);outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.panel{padding:32px;border:1px solid #ded9ce;background:white}.dark{background:var(--navy);color:var(--ivory)}img{display:block;max-width:100%;height:auto}.swatches{display:flex;flex-wrap:wrap;gap:16px}.swatch{min-width:180px;padding:24px;border:1px solid #ded9ce}.gold{background:var(--gold)}.navy{background:var(--navy);color:var(--ivory)}.ivory{background:var(--ivory)}.sizes{display:flex;align-items:end;gap:28px}.clear{padding:7%;border:1px dashed var(--gold)}code{font-size:14px}</style></head><body><main><h1>Договори.нет — визуален бранд наръчник</h1><p>Одобрен кирилски монограм „ДН“, септември 2026 г.</p><a class="download" href="dogovori-brand-kit.zip" download>Изтеглете целия пакет</a><h2>Основни версии</h2><div class="grid"><section class="panel"><img src="logo-light.svg" alt="Лого за светъл фон"></section><section class="panel dark"><img src="logo-dark.svg" alt="Лого за тъмен фон"></section></div><h2>Палитра</h2><div class="swatches"><div class="swatch gold"><b>Gold</b><br><code>${BRAND_COLORS.gold}</code></div><div class="swatch navy"><b>Navy</b><br><code>${BRAND_COLORS.navy}</code></div><div class="swatch ivory"><b>Ivory</b><br><code>${BRAND_COLORS.ivory}</code></div></div><h2>Свободно поле</h2><div class="panel"><div class="clear"><img src="mark-gold.svg" width="260" height="219" alt="Знак със свободно поле"></div><p>Пазете свободно поле поне 1/4 от височината на знака.</p></div><h2>Малки размери</h2><div class="panel sizes"><img src="mark-mini.svg" width="16" height="14" alt="Знак 16 пиксела"><img src="mark-mini.svg" width="32" height="27" alt="Знак 32 пиксела"><img src="mark-gold.svg" width="64" height="54" alt="Знак 64 пиксела"></div><h2>Самостоятелни знаци</h2><div class="grid"><section class="panel"><img src="mark-gold.svg" alt="Златен знак"></section><section class="panel"><img src="mark-navy.svg" alt="Navy знак"></section><section class="panel dark"><img src="mark-white.svg" alt="Ivory знак"></section></div></main></body></html>`;
writeFileSync(resolve(out, "index.html"), guide);

const packageFiles = [
  "logo-light.svg", "logo-dark.svg", "mark-gold.svg", "mark-navy.svg", "mark-white.svg", "logo-mono.svg", "mark-mini.svg",
  "logo-light@2x.png", "logo-dark@2x.png", "icon512.png", "avatar-light1024.png", "avatar-dark1024.png",
  "og1200x630.svg", "og1200x630.jpg", "favicon.ico", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png",
  "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png",
  "index.html", "README.md", "brandGeometry.ts", "reproduce.ts",
] as const;

rmSync(resolve(out, "dogovori-brand-kit.zip"), { force: true });
run("zip", ["-q", "dogovori-brand-kit.zip", ...packageFiles]);
console.log("Бранд пакетът е възпроизведен само от локалните файлове.");