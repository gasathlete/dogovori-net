/** Синтетични DOCX fixtures за тестове (без клиентски данни). */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
}

/** Минимален синтетичен DOCX (fixture, без клиентски данни). */
export async function makeZip(files: Record<string, string>, opts: { encrypt?: boolean; lieSize?: boolean } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  const le16 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff);
  const le32 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  let count = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = enc.encode(content);
    const comp = await deflateRaw(data);
    const nameB = enc.encode(name);
    const offset = locals.length;
    const flags = opts.encrypt ? 1 : 0;
    const size = opts.lieSize ? data.length + 7 : data.length;
    le32(locals, 0x04034b50); le16(locals, 20); le16(locals, flags); le16(locals, 8);
    le16(locals, 0); le16(locals, 0); le32(locals, crc32(data)); le32(locals, comp.length);
    le32(locals, size); le16(locals, nameB.length); le16(locals, 0);
    locals.push(...nameB, ...comp);
    le32(central, 0x02014b50); le16(central, 20); le16(central, 20); le16(central, flags); le16(central, 8);
    le16(central, 0); le16(central, 0); le32(central, crc32(data)); le32(central, comp.length);
    le32(central, size); le16(central, nameB.length); le16(central, 0); le16(central, 0);
    le16(central, 0); le16(central, 0); le32(central, 0); le32(central, offset);
    central.push(...nameB);
    count++;
  }
  const eocd: number[] = [];
  le32(eocd, 0x06054b50); le16(eocd, 0); le16(eocd, 0); le16(eocd, count); le16(eocd, count);
  le32(eocd, central.length); le32(eocd, locals.length); le16(eocd, 0);
  return new Uint8Array([...locals, ...central, ...eocd]);
}

