/**
 * Визуализация за метода „прикачен файл с подпис“.
 *
 * Платформата НЕ валидира сертификата, веригата на доверие и обвързаността на
 * приложения файл с документа. Затова върху документа не се поставя картинка,
 * която твърди „Подписано с КЕП (QES)“ — вместо това се изписва фактът:
 * име на файла и неговият SHA-256 отпечатък.
 */

export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function makeAttachedSignatureCardPng(opts: {
  signerName: string;
  fileName: string;
  sha256?: string | null;
}): string {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 220;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#0a0a1a";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = "#0a0a1a";

  ctx.font = "bold 20px serif";
  ctx.fillText("Приложен файл с електронен подпис", 20, 44);

  ctx.font = "16px serif";
  ctx.fillText(`Подписващ: ${opts.signerName.slice(0, 60)}`, 20, 80);
  ctx.fillText(`Файл: ${opts.fileName.slice(0, 60)}`, 20, 108);

  ctx.font = "12px monospace";
  if (opts.sha256) {
    ctx.fillText(`SHA-256: ${opts.sha256.slice(0, 32)}`, 20, 136);
    ctx.fillText(`         ${opts.sha256.slice(32)}`, 20, 154);
  }

  ctx.font = "13px serif";
  ctx.fillText(new Date().toLocaleString("bg-BG"), 20, 182);
  ctx.fillStyle = "#5a5a6a";
  ctx.font = "12px serif";
  ctx.fillText(
    "Платформата не проверява сертификата на приложения файл.",
    20,
    202,
  );
  return c.toDataURL("image/png");
}
