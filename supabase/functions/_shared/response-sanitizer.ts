// Shared response-sanitizer for DogovaryAI assistant endpoints.
// Consolidates logic previously duplicated between assistant-chat and
// assistant-chat-anon so both endpoints stay behaviourally in sync.
//
// Everything here is IDEMPOTENT — safe to run multiple times on the same text
// (streaming pre-emit + post-stream persist path both call these).

// ─────────────────────────────────────────────────────────────────────────
// BGN → EUR conversion (BG adopted the euro on 2026-01-01, fixed rate).
// ─────────────────────────────────────────────────────────────────────────
export const BGN_RATE = 1.95583;

// Note: JavaScript `\b` is ASCII-only, so `лв\b` never matches after Cyrillic.
// We use a Unicode-aware negative lookahead `(?![\p{L}\p{N}])` instead.
const BGN_LITERAL_RE =
  /(\d{1,3}(?:[.\s\u00A0]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(лв\.?|лева|BGN)(?![\p{L}\p{N}])/giu;

export function scrubBgnLiterals(text: string): string {
  if (!text || !/(лв|лева|BGN)/i.test(text)) return text;
  return text.replace(BGN_LITERAL_RE, (_m, num: string) => {
    const normalized = num
      .replace(/[\s\u00A0]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "") // thousands dot
      .replace(",", ".");
    const n = Number(normalized);
    if (!isFinite(n) || n <= 0) return `${num} €`;
    const eur = n / BGN_RATE;
    const formatted = eur >= 100
      ? Math.round(eur).toLocaleString("bg-BG")
      : eur.toFixed(2).replace(".", ",");
    return `${formatted} €`;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Double-currency notation guard.
// Removes leftover "лв./€", "€/лв.", "(лв.)", "(BGN)" fragments the model
// sometimes emits when it tries to show both currencies. After BGN scrubbing
// there may be an orphan " / €" or "( / €)" — this cleans them up.
// ─────────────────────────────────────────────────────────────────────────
export function scrubDoubleCurrency(text: string): string {
  if (!text) return text;
  // Fast path: only run replacements if any relevant token is present.
  // Avoids collapsing whitespace/newlines on unrelated content (breaks markdown).
  const needsWork = /€\s*[\/|]\s*€|\(\s*(?:BGN|лв\.?|лева)\s*\)|\(\s*[\/|]|[\/|]\s*\)|\(\s*\)/i.test(text);
  if (!needsWork) return text;
  return text
    // "1000 € / € " or "1000 € /  € "  → "1000 €"
    .replace(/(\d[\d.,\s]*\s*€)[ \t]*[\/|][ \t]*€/g, "$1")
    // "( / 1000 €)" or "(лв. / )" residual
    .replace(/\([ \t]*[\/|][ \t]*/g, "(")
    .replace(/[ \t]*[\/|][ \t]*\)/g, ")")
    // orphan "( )" or "()"
    .replace(/\([ \t]*\)/g, "")
    // "€ (BGN)" / "€ (лв.)" — remove parenthetical currency alias
    .replace(/[ \t]*\(\s*(?:BGN|лв\.?|лева)\s*\)/gi, "")
    // Collapse only horizontal whitespace runs — preserve newlines so
    // markdown paragraphs/lists survive streaming.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

// ─────────────────────────────────────────────────────────────────────────
// Fake source-marker scrubber. Preserves markers that reference real RAG
// entries ([S1..S{citCount}]), strips the rest.
// ─────────────────────────────────────────────────────────────────────────
export function scrubFakeCitations(text: string, citCount: number): string {
  if (!text) return text;
  const cc = Math.max(0, citCount | 0);
  return text
    .replace(/\s?\[S(\d+)\]/gi, (_m, nStr) => {
      const n = parseInt(nStr, 10);
      return n >= 1 && n <= cc ? ` [S${n}]` : "";
    })
    .replace(/\s?\[източник\s*(\d+)\]/gi, (_m, nStr) => {
      const n = parseInt(nStr, 10);
      return n >= 1 && n <= cc ? ` [източник ${n}]` : "";
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Persistent Gemini hallucination: "чл. 328 ЗЗД е отменен / не съществува".
// (Article 328 is a live provision of the Labour Code, not the Obligations
// and Contracts Act.) Drop the whole misleading sentence.
// ─────────────────────────────────────────────────────────────────────────
export function scrubChl328Hallucination(text: string): string {
  if (!text) return text;
  return text
    // Ordering 1: "чл. 328 ... ЗЗД ... отмен/не съществува ..."
    .replace(
      /(?:^|(?<=\s))[^.!?]{0,80}чл(?:ен|\.)?\s*328[^.!?]{0,80}?(?:ЗЗД|Закон\s+за\s+задълженията)[^.!?]{0,80}?(?:отмен|не\s+същест|няма\s+так)[^.!?]{0,80}[.!?]\s*/gi,
      " ",
    )
    // Ordering 2: "отмен ... чл. 328 ... ЗЗД" — stop right after ЗЗД so
    // we don't consume the rest of the sentence (e.g. ", използвайте КТ.").
    .replace(
      /(?:^|(?<=\s))[^.!?]{0,40}(?:отмен|не\s+същест)[^.!?]{0,60}чл(?:ен|\.)?\s*328[^.!?]{0,60}(?:ЗЗД|Закон\s+за\s+задълженията)\s*[,;.!?]?\s*/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Outdated-year advisory tag. When the model presents figures/rates as
// "актуален за 2024 г." / "по данни от 2025 г.", downgrade to explicit
// "(историческа справка — сверете актуалната стойност)" so users don't
// treat pre-2026 numbers as current. We only append the disclaimer if it's
// not already present in the surrounding sentence.
// ─────────────────────────────────────────────────────────────────────────
const OUTDATED_YEAR_RE =
  /((?:актуал[\p{L}]*|по\s+данни|към|съгласно|размер[\p{L}]*)\s+(?:за\s+|от\s+)?)(202[0-5])(\s*г\.?)/giu;

export function annotateOutdatedYear(text: string): string {
  if (!text) return text;
  return text.replace(OUTDATED_YEAR_RE, (m, pre: string, year: string, suf: string, offset: number, full: string) => {
    // Idempotency: skip if the standard disclaimer already follows.
    const tail = full.slice(offset + m.length, offset + m.length + 120);
    if (/историческа\s+справка|сверете\s+актуалната/i.test(tail)) return m;
    if (/историческ|сверете|проверете\s+в\s+ДВ|актуалната\s+стойност/i.test(m)) return m;
    return `${pre}${year}${suf} _(историческа справка — сверете актуалната стойност в ДВ/НАП/МТСП)_`;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Fabricated case law guard. Only strips court-decision citations when the
// RAG context contains ZERO citations at all — otherwise we trust that the
// citations are grounded (they may come from the knowledge base).
// Matches typical BG format: "Решение № 123/2020 г. ... ВКС/ВАС/ОС".
// ─────────────────────────────────────────────────────────────────────────
// Note: `[^!?]{0,300}?` allows internal `.` (e.g. "т.д.", "ВКС, II т.о.")
// but caps total length so we don't eat neighbouring sentences.
const CASE_LAW_RE =
  /Решение\s+№\s*\d+\s*\/\s*(?:19|20)\d{2}\s*г\.[^!?]{0,300}?(?:ВКС|ВАС|СГС|САС|Апелативен\s+съд|Окръжен\s+съд)[^!?]{0,80}?[.!?]/giu;

export function scrubFakeCaseLaw(text: string, hasCitations: boolean): string {
  if (!text || hasCitations) return text;
  return text.replace(CASE_LAW_RE, "").replace(/\s{2,}/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt-injection echo guard. If the model parroted back attacker phrases
// like "ignore previous instructions" or "system prompt:", drop those lines
// entirely. Rarely triggers but keeps the UI clean when it does.
// ─────────────────────────────────────────────────────────────────────────
const INJECTION_ECHO_RE =
  /^.*(ignore\s+previous\s+instructions|system\s+prompt\s*:|jailbreak\s+mode|act\s+as\s+dan)\b.*$/gim;

export function scrubInjectionEcho(text: string): string {
  if (!text) return text;
  return text.replace(INJECTION_ECHO_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ─────────────────────────────────────────────────────────────────────────
// High-risk escalation banner (arrest, criminal, litigation, domestic
// violence, child protection). Injected once if the model didn't already
// recommend a lawyer/НБПП.
// ─────────────────────────────────────────────────────────────────────────
// Uses word stems (задърж, обвин, наказател…) so we catch inflected forms
// like "Задържаха", "задържане", "обвинителен акт" etc.
export const HIGH_RISK_RE =
  /(арест|задърж|обвин|наказател|прокурат|полиц|съдебн(о|и)\s+заседание|дело\s+№|заповед\s+за\s+защита|домашн(о|и)\s+насил|отвлич|непълнолетн|малолетн|органи(те)?\s+на\s+ди|детск(а|и)\s+служб)/i;

export const HIGH_RISK_ESCALATION_MARK =
  /адвокат|правна\s+помощ|национал(на|но)\s+бюро|нбпп/i;

export function highRiskBanner(): string {
  return "⚠️ **Случаят изглежда високорисков.** Препоръчваме незабавна консултация с адвокат — можете да ползвате [Национално бюро за правна помощ](https://nbpp.government.bg) при доходов праг, или частен адвокат. DogovaryAI не заменя правен съветник при висящо производство.";
}

export function injectHighRiskBanner(text: string, userMsg: string): string {
  if (!HIGH_RISK_RE.test(userMsg)) return text;
  if (HIGH_RISK_ESCALATION_MARK.test(text)) return text;
  return `${text}\n\n${highRiskBanner()}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Full post-stream sanitiser pipeline. Order matters — citations first
// (before BGN scrub can leave odd digits), then hallucinations, then
// currency cleanup, then double-currency parens, then year annotations.
// ─────────────────────────────────────────────────────────────────────────
export interface SanitizeOpts {
  citationCount: number;
  userMsg?: string;
  injectRiskBanner?: boolean;
}

export function sanitizeAssistantReply(text: string, opts: SanitizeOpts): string {
  if (!text) return text;
  let out = text;
  out = scrubFakeCitations(out, opts.citationCount);
  out = scrubChl328Hallucination(out);
  out = scrubInjectionEcho(out);
  out = scrubFakeCaseLaw(out, opts.citationCount > 0);
  out = scrubBgnLiterals(out);
  out = scrubDoubleCurrency(out);
  out = annotateOutdatedYear(out);
  if (opts.injectRiskBanner && opts.userMsg) {
    out = injectHighRiskBanner(out, opts.userMsg);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Chunk-boundary safe streaming scrubber. Buffers the last ~40 chars so
// currency literals / source markers / `<followups>` tags split across
// stream chunks are handled correctly.
// ─────────────────────────────────────────────────────────────────────────
export function makeStreamScrubber(opts: { citationCount: number } = { citationCount: 0 }) {
  let pending = "";
  let followupsStarted = false;
  const TAIL = 40;
  const citCount = Math.max(0, opts.citationCount | 0);

  const staticScrub = (s: string) =>
    scrubDoubleCurrency(
      scrubBgnLiterals(scrubFakeCitations(s, citCount)),
    );

  return {
    push(chunk: string): string {
      if (followupsStarted || !chunk) return "";
      pending += chunk;
      const openIdx = pending.search(/<followups\b/i);
      if (openIdx >= 0) {
        const safe = pending.slice(0, openIdx);
        pending = "";
        followupsStarted = true;
        return staticScrub(safe);
      }
      if (/<[a-z]{0,10}$/i.test(pending)) return "";
      if (pending.length <= TAIL) return "";
      const emitLen = pending.length - TAIL;
      const emit = pending.slice(0, emitLen);
      pending = pending.slice(emitLen);
      return staticScrub(emit);
    },
    flush(): string {
      if (followupsStarted) {
        pending = "";
        return "";
      }
      const out = staticScrub(pending);
      pending = "";
      return out;
    },
  };
}
