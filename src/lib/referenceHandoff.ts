/**
 * Локално предаване на контекст от препратка (заглавие на родителя, страни,
 * предмет) към /build без да се слага в URL (история, логове, referrer).
 * Само sessionStorage на този таб; без отдалечен запис. Еднократно четене
 * не е нужно — ключът е случаен и се чисти при изтичане.
 */
export interface ReferenceHandoff {
  parentTitle?: string;
  partiesA?: string[];
  partiesB?: string[];
  subject?: string;
}

const PREFIX = "dogovori:refctx:";
const TTL_MS = 30 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9-]{36}$/;

function clip(s: unknown, n: number): string | undefined {
  return typeof s === "string" && s.trim() ? s.slice(0, n) : undefined;
}
function clipList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 300));
  return out.length ? out : undefined;
}

export function storeReferenceHandoff(ctx: ReferenceHandoff): string | null {
  try {
    const token = crypto.randomUUID();
    const clean: ReferenceHandoff = {
      parentTitle: clip(ctx.parentTitle, 300),
      partiesA: clipList(ctx.partiesA),
      partiesB: clipList(ctx.partiesB),
      subject: clip(ctx.subject, 1000),
    };
    sessionStorage.setItem(PREFIX + token, JSON.stringify({ at: Date.now(), ctx: clean }));
    return token;
  } catch {
    return null;
  }
}

export function readReferenceHandoff(token: string | null | undefined): ReferenceHandoff | null {
  if (!token || !TOKEN_RE.test(token)) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + token);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: number; ctx?: ReferenceHandoff };
    if (typeof v.at !== "number" || Date.now() - v.at > TTL_MS) {
      sessionStorage.removeItem(PREFIX + token);
      return null;
    }
    const c = v.ctx ?? {};
    return { parentTitle: clip(c.parentTitle, 300), partiesA: clipList(c.partiesA), partiesB: clipList(c.partiesB), subject: clip(c.subject, 1000) };
  } catch {
    return null;
  }
}
