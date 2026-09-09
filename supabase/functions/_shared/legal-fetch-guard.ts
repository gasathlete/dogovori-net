// N0 — безопасно извличане САМО от затворения официален allowlist.
//
// Инварианти:
//   * Никакъв URL от потребител. Влизат само (registry entry, adapter path).
//   * Само https и само точния origin на записа; всеки redirect се валидира
//     отново и fail-closed при смяна на scheme/origin/непозволен път.
//   * Изричен timeout, таван на байтовете, allowlist за content-type.
//   * Условно извличане (ETag / Last-Modified) и метаданни за backoff.
//   * Отговорът е НЕДОВЕРЕНИ ДАННИ. Никога инструкция, никога изпълним код.
//   * Кодовете за грешка са затворено множество; тяло на отговора не изтича.

import type { LegalSourceEntry } from "./legal-source-registry.ts";
import { isAllowedOrigin } from "./legal-source-registry.ts";

export type FetchErrorCode =
  | "user_url_rejected"
  | "origin_not_allowed"
  | "scheme_not_allowed"
  | "path_not_allowed"
  | "redirect_origin_changed"
  | "redirect_missing_location"
  | "too_many_redirects"
  | "timeout"
  | "response_too_large"
  | "content_type_not_allowed"
  | "http_error"
  | "network_error"
  | "source_disabled";

export interface SafeFetchOk {
  ok: true;
  canonicalUrl: string;
  status: number;
  contentType: string;
  byteCount: number;
  checksum: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
  notModified: false;
}

export interface SafeFetchNotModified {
  ok: true;
  notModified: true;
  canonicalUrl: string;
  status: 304;
  etag: string | null;
  lastModified: string | null;
}

export interface SafeFetchFail {
  ok: false;
  errorCode: FetchErrorCode;
  /** HTTP статус, ако е получен. Никога тяло на отговора. */
  status: number | null;
}

export type SafeFetchResult = SafeFetchOk | SafeFetchNotModified | SafeFetchFail;

export const MAX_REDIRECTS = 3;

/** Детерминистичен каноничен URL: без fragment, без празен query, нормализиран път. */
export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  if (u.search === "?") u.search = "";
  u.hostname = u.hostname.toLowerCase();
  u.protocol = u.protocol.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443")) u.port = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/") && u.pathname !== "/") {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  // Празен query („?“ без параметри) не е част от каноничния URL.
  return u.toString().replace(/\?$/, "");
}

export function sha256HexOf(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
}

/**
 * Segment-safe проверка на пътя. Никакво „prefix startsWith“ подхлъзване:
 *   * "/"            → разрешава САМО root ("/").
 *   * "/bg/laws/"     → разрешава "/bg/laws/" и всичко под него.
 *   * "/bg/laws"      → разрешава точно "/bg/laws" или "/bg/laws/..." ,
 *                       но НЕ "/bg/lawsmith".
 * Пътищата винаги са code-owned (никога от потребител).
 */
function pathAllowed(entry: LegalSourceEntry, pathname: string): boolean {
  return entry.allowedPathPrefixes.some((p) => {
    if (p === "/") return pathname === "/";
    if (p.endsWith("/")) return pathname === p || pathname.startsWith(p);
    return pathname === p || pathname.startsWith(p + "/");
  });
}

/**
 * Прочита тялото поточно, като брои РЕАЛНИТЕ байтове и прекъсва веднага при
 * надхвърляне на тавана. Няма второ неограничено копие в паметта.
 */
async function readBodyBounded(
  resp: Response,
  maxBytes: number,
): Promise<
  | { ok: true; text: string; byteCount: number }
  | { ok: false; code: "response_too_large" | "network_error" }
> {
  const decoder = new TextDecoder("utf-8");
  const body = resp.body;
  if (!body) {
    let buf: Uint8Array;
    try {
      buf = new Uint8Array(await resp.arrayBuffer());
    } catch {
      return { ok: false, code: "network_error" };
    }
    if (buf.byteLength > maxBytes) return { ok: false, code: "response_too_large" };
    return { ok: true, text: decoder.decode(buf), byteCount: buf.byteLength };
  }

  const reader = body.getReader();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // игнорира се: вече отказваме отговора
        }
        return { ok: false, code: "response_too_large" };
      }
      // stream:true декодира коректно multibyte UTF-8 през границите на chunk-ове.
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text, byteCount: total };
  } catch {
    try {
      await reader.cancel();
    } catch {
      // игнорира се
    }
    return { ok: false, code: "network_error" };
  }
}


/**
 * Проверява, че URL принадлежи точно на този запис от регистъра.
 * Всяко отклонение връща затворен код за грешка.
 */
export function validateUrlForEntry(
  entry: LegalSourceEntry,
  raw: string,
): { ok: true; url: string } | { ok: false; errorCode: FetchErrorCode } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, errorCode: "user_url_rejected" };
  }
  if (u.protocol !== "https:") return { ok: false, errorCode: "scheme_not_allowed" };
  const origin = `${u.protocol}//${u.host}`;
  if (!isAllowedOrigin(origin)) return { ok: false, errorCode: "origin_not_allowed" };
  if (origin !== entry.origin) return { ok: false, errorCode: "origin_not_allowed" };
  if (!pathAllowed(entry, u.pathname)) return { ok: false, errorCode: "path_not_allowed" };
  return { ok: true, url: canonicalizeUrl(u.toString()) };
}

/** Строи разрешен URL от адаптерен път. Пътят НИКОГА не идва от потребител. */
export function buildSourceUrl(
  entry: LegalSourceEntry,
  adapterPath: string,
): { ok: true; url: string } | { ok: false; errorCode: FetchErrorCode } {
  if (!adapterPath.startsWith("/")) return { ok: false, errorCode: "path_not_allowed" };
  return validateUrlForEntry(entry, entry.origin + adapterPath);
}

function normalizeContentType(raw: string | null): string {
  return (raw ?? "").split(";")[0].trim().toLowerCase();
}

export interface SafeFetchOpts {
  /** Път, дефиниран от адаптера (не от потребител). По подразбиране entryPath. */
  adapterPath?: string;
  etag?: string | null;
  lastModified?: string | null;
  fetchImpl?: typeof fetch;
  /** Инжектира се в тестове, за да няма реална мрежа. */
  now?: () => number;
}

/**
 * Извлича официален отговор при спазване на всички ограничения.
 * Върнатият `body` е недоверено съдържание за парсване като данни.
 */
export async function safeFetchSource(
  entry: LegalSourceEntry,
  opts: SafeFetchOpts = {},
): Promise<SafeFetchResult> {
  if (!entry.enabled || entry.reviewStatus !== "approved") {
    return { ok: false, errorCode: "source_disabled", status: null };
  }

  const built = buildSourceUrl(entry, opts.adapterPath ?? entry.entryPath);
  if (!built.ok) return { ok: false, errorCode: built.errorCode, status: null };

  const doFetch = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "User-Agent": "dogovori.net-legal-monitor/1.0 (+https://dogovori.net)",
    "Accept-Language": "bg,en;q=0.8",
  };
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;

  let currentUrl = built.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), entry.timeoutMs);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let resp: Response;
      try {
        resp = await doFetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers,
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) return { ok: false, errorCode: "timeout", status: null };
        return { ok: false, errorCode: "network_error", status: null };
      }

      if (resp.status === 304) {
        return {
          ok: true,
          notModified: true,
          canonicalUrl: currentUrl,
          status: 304,
          etag: resp.headers.get("etag"),
          lastModified: resp.headers.get("last-modified"),
        };
      }

      if (resp.status >= 300 && resp.status < 400) {
        if (hop === MAX_REDIRECTS) return { ok: false, errorCode: "too_many_redirects", status: resp.status };
        const loc = resp.headers.get("location");
        if (!loc) return { ok: false, errorCode: "redirect_missing_location", status: resp.status };
        let next: string;
        try {
          next = new URL(loc, currentUrl).toString();
        } catch {
          return { ok: false, errorCode: "redirect_origin_changed", status: resp.status };
        }
        const check = validateUrlForEntry(entry, next);
        if (!check.ok) {
          // Fail-closed при смяна на scheme/origin или непозволен път.
          return { ok: false, errorCode: "redirect_origin_changed", status: resp.status };
        }
        currentUrl = check.url;
        continue;
      }

      if (!resp.ok) return { ok: false, errorCode: "http_error", status: resp.status };

      const contentType = normalizeContentType(resp.headers.get("content-type"));
      if (!entry.allowedContentTypes.includes(contentType)) {
        return { ok: false, errorCode: "content_type_not_allowed", status: resp.status };
      }

      const declared = Number(resp.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > entry.maxBytes) {
        return { ok: false, errorCode: "response_too_large", status: resp.status };
      }

      const read = await readBodyBounded(resp, entry.maxBytes);
      if (!read.ok) {
        if (read.code === "network_error" && controller.signal.aborted) {
          return { ok: false, errorCode: "timeout", status: resp.status };
        }
        return { ok: false, errorCode: read.code, status: resp.status };
      }
      const text = read.text;
      const byteCount = read.byteCount;


      return {
        ok: true,
        notModified: false,
        canonicalUrl: currentUrl,
        status: resp.status,
        contentType,
        byteCount,
        checksum: await sha256HexOf(text),
        body: text,
        etag: resp.headers.get("etag"),
        lastModified: resp.headers.get("last-modified"),
      };
    }
    return { ok: false, errorCode: "too_many_redirects", status: null };
  } finally {
    clearTimeout(timer);
  }
}
