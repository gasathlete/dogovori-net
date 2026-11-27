/**
 * Изтегляне от одобрен външен източник без SSRF чрез пренасочване:
 * ръчно следване на redirect, всеки скок се проверява срещу allowlist-а,
 * ограничен брой скокове, таймаут и таван на размера на тялото.
 */
export class SafeFetchError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SafeFetchError"; }
}

export interface SafeFetchOptions {
  allowedHosts: ReadonlySet<string>;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function isAllowedUrl(u: URL, allowed: ReadonlySet<string>): boolean {
  return (u.protocol === "https:" || u.protocol === "http:") &&
    u.username === "" && u.password === "" &&
    (u.port === "" || u.port === "80" || u.port === "443") &&
    allowed.has(u.host.toLowerCase());
}

export async function safeFetchText(
  input: string,
  opts: SafeFetchOptions,
): Promise<{ status: number; ok: boolean; text: string; finalUrl: string }> {
  const max = opts.maxRedirects ?? 3;
  const limit = opts.maxBytes ?? 8_000_000;
  const f = opts.fetchImpl ?? fetch;
  let url: URL;
  try { url = new URL(input); } catch { throw new SafeFetchError("invalid_url"); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    for (let hop = 0; ; hop++) {
      if (!isAllowedUrl(url, opts.allowedHosts)) throw new SafeFetchError("host_not_allowed");
      const resp = await f(url.toString(), { headers: opts.headers, redirect: "manual", signal: ctrl.signal });
      if (resp.status >= 300 && resp.status < 400) {
        await resp.body?.cancel();
        const loc = resp.headers.get("location");
        if (!loc) throw new SafeFetchError("redirect_without_location");
        if (hop >= max) throw new SafeFetchError("too_many_redirects");
        try { url = new URL(loc, url); } catch { throw new SafeFetchError("invalid_redirect"); }
        continue;
      }
      const declared = Number(resp.headers.get("content-length") ?? "0");
      if (declared > limit) { await resp.body?.cancel(); throw new SafeFetchError("body_too_large"); }
      const reader = resp.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > limit) { await reader.cancel(); throw new SafeFetchError("body_too_large"); }
          chunks.push(value);
        }
      }
      const buf = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
      return { status: resp.status, ok: resp.ok, text: new TextDecoder().decode(buf), finalUrl: url.toString() };
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    if (ctrl.signal.aborted) throw new SafeFetchError("timeout");
    throw new SafeFetchError("fetch_failed");
  } finally {
    clearTimeout(timer);
  }
}
