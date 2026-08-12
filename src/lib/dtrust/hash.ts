/**
 * SHA-256 отпечатък на документ.
 *
 * Към доставчика на подпис се изпраща само този отпечатък — съдържанието на
 * документа не напуска платформата.
 */

export async function sha256HexOfBlob(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
