/**
 * Shared loader for the Cyrillic-capable PDF font (DejaVuSans).
 *
 * Performance layers (fastest to slowest):
 *   1. In-memory cache (within a single SPA session)
 *   2. IndexedDB cache (persistent across tabs and page reloads)
 *   3. Local bundled font (`/fonts/DejaVuSans.ttf`)
 *   4. CDN fetch fallback (jsdelivr → unpkg)
 *
 * The first PDF export in a brand-new browser pays the CDN fetch
 * (~750KB). Every subsequent export — even after closing the tab and
 * reopening the site days later — reads from IndexedDB in <10ms.
 */

const FONT_VERSION = "dejavu-sans-2.37.0";
const DB_NAME = "dogovori-pdf-font";
const STORE = "fonts";
const SOURCES = [
  "/fonts/DejaVuSans.ttf",
  "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf",
  "https://unpkg.com/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf",
];

let memCache: string | null = null;
let inflight: Promise<string> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function fetchAndEncode(): Promise<string> {
  let lastErr: unknown;
  for (const url of SOURCES) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Validate TTF/OTF signature.
      const sig = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
      if (sig !== 0x00010000 && sig !== 0x4f54544f && sig !== 0x74727565) {
        throw new Error("Invalid TTF signature");
      }
      return bytesToBase64(bytes);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Не успяхме да заредим шрифт за PDF: ${String((lastErr as Error)?.message ?? lastErr)}`,
  );
}

/**
 * Returns the base64-encoded TTF for embedding via jsPDF.addFileToVFS.
 * Concurrent callers share a single in-flight Promise.
 */
export function loadCyrillicFontB64(): Promise<string> {
  if (memCache) return Promise.resolve(memCache);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cached = await idbGet(FONT_VERSION);
      if (cached) {
        memCache = cached;
        return cached;
      }
      const fresh = await fetchAndEncode();
      memCache = fresh;
      // Fire-and-forget persist; don't block return.
      void idbSet(FONT_VERSION, fresh);
      return fresh;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hint the browser to download and cache the font during idle time.
 * Safe to call multiple times. Never throws.
 */
export function prefetchCyrillicFont(): void {
  if (memCache || inflight) return;
  const run = () => {
    void loadCyrillicFontB64().catch(() => {
      /* swallow — real download will retry */
    });
  };
  if (typeof (globalThis as any).requestIdleCallback === "function") {
    (globalThis as any).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 200);
  }
}
