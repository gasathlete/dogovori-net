/**
 * Малки варианти на изображенията от хранилището.
 *
 * Логата на партньорите се качват в оригинален размер (често 1–2 MB PNG), но се
 * показват в карета от 150–320 px. Тук пренасочваме публичния адрес към
 * трансформиращия endpoint, така че браузърът да получи точния нужен размер.
 * При адрес, който не е от хранилището (външен CDN), връщаме адреса без промяна.
 */

const PUBLIC_OBJECT = "/storage/v1/object/public/";
const PUBLIC_RENDER = "/storage/v1/render/image/public/";

export type ThumbFit = "contain" | "cover";

export function storageThumb(
  url: string | null | undefined,
  width: number,
  height: number,
  options: { quality?: number; fit?: ThumbFit } = {},
): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed.includes(PUBLIC_OBJECT)) return trimmed;
  const base = trimmed.split("?")[0].replace(PUBLIC_OBJECT, PUBLIC_RENDER);
  const quality = options.quality ?? 62;
  const fit = options.fit ?? "contain";
  return `${base}?width=${Math.round(width)}&height=${Math.round(height)}&resize=${fit}&quality=${quality}`;
}
