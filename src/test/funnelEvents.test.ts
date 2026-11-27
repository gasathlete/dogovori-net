import { beforeEach, describe, expect, it } from "vitest";
import {
  CANONICAL_EVENTS,
  STORED_NAME,
  canonicalEventName,
  buildDedupKey,
  claimOnce,
  resetOnceStore,
  sanitizeFunnelProps,
  ONCE_PER_SESSION_DOC,
} from "@/lib/funnelEvents";

describe("funnelEvents — канонична таксономия", () => {
  it("всяко канонично събитие има съхранено име и обратната карта е еднозначна", () => {
    const stored = new Set<string>();
    for (const c of CANONICAL_EVENTS) {
      const s = STORED_NAME[c];
      expect(s, `няма stored name за ${c}`).toBeTruthy();
      expect(stored.has(s), `дублирано stored name ${s}`).toBe(false);
      stored.add(s);
      expect(canonicalEventName(s)).toBe(c);
      // Каноничното име също се разпознава (бъдещи редове, записани директно).
      expect(canonicalEventName(c)).toBe(c);
    }
  });

  it("историческите имена от 31-дневния одит се картографират коректно", () => {
    expect(canonicalEventName("doc_start")).toBe("document_selected");
    expect(canonicalEventName("doc_fill_step")).toBe("wizard_step_completed");
    expect(canonicalEventName("doc_generate_started")).toBe("generation_started");
    expect(canonicalEventName("doc_generate_success")).toBe("generation_succeeded");
    expect(canonicalEventName("doc_generate_fail")).toBe("generation_failed");
    expect(canonicalEventName("doc_generate_blocked")).toBe("generation_blocked");
    expect(canonicalEventName("doc_download_success")).toBe("document_downloaded");
    expect(canonicalEventName("upgrade_completed")).toBe("checkout_completed");
    expect(canonicalEventName("something_else")).toBeNull();
  });

  it("опитите за генериране и свалянията НЕ са в once-списъка (всеки опит е факт)", () => {
    for (const c of ["generation_started", "generation_succeeded", "generation_failed", "generation_blocked", "document_downloaded", "download_failed"] as const) {
      expect(ONCE_PER_SESSION_DOC.has(c)).toBe(false);
    }
    expect(ONCE_PER_SESSION_DOC.has("document_selected")).toBe(true);
    expect(ONCE_PER_SESSION_DOC.has("result_viewed")).toBe(true);
  });
});

describe("funnelEvents — дедупликация", () => {
  beforeEach(() => {
    resetOnceStore();
  });

  it("buildDedupKey е независим от регистъра и празните части", () => {
    expect(buildDedupKey(["Trudov-Dogovor", "wizard"])).toBe(buildDedupKey(["trudov-dogovor", "wizard"]));
    expect(buildDedupKey(["a", undefined, null, "b"])).toBe(buildDedupKey(["a", "", "", "b"]));
    expect(buildDedupKey(["a", 1])).not.toBe(buildDedupKey(["a", 2]));
  });

  it("claimOnce връща true само първия път за даден ключ", () => {
    const key = buildDedupKey(["doc", "wizard"]);
    expect(claimOnce(key)).toBe(true);
    expect(claimOnce(key)).toBe(false);
    expect(claimOnce(buildDedupKey(["doc", "build"]))).toBe(true);
  });

  it("ключовете изтичат след TTL (24ч)", () => {
    const key = buildDedupKey(["ttl"]);
    const t0 = 1_700_000_000_000;
    expect(claimOnce(key, t0)).toBe(true);
    expect(claimOnce(key, t0 + 60_000)).toBe(false);
    expect(claimOnce(key, t0 + 25 * 60 * 60 * 1000)).toBe(true);
  });

  it("складът е ограничен — старите ключове се изместват", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 450; i++) claimOnce(buildDedupKey(["k", i]), t0 + i);
    const raw = JSON.parse(localStorage.getItem("funnel_once_v1") ?? "{}") as Record<string, number>;
    expect(Object.keys(raw).length).toBeLessThanOrEqual(400);
    // Най-новият ключ остава.
    expect(claimOnce(buildDedupKey(["k", 449]), t0 + 1000)).toBe(false);
  });
});

describe("funnelEvents — санитизация (без PII)", () => {
  it("пропуска e-mail, ЕГН и IBAN", () => {
    const out = sanitizeFunnelProps({
      email: "ivan@example.com",
      egn: "8001011234",
      iban: "BG80BNBG96611020345678",
      note: "Свържете се на ivan@example.com",
      ok: "trudov-dogovor",
    });
    expect(out).toEqual({ ok: "trudov-dogovor" });
  });

  it("реже дълги низове и отхвърля свободен текст с непозволени символи", () => {
    const out = sanitizeFunnelProps({
      long: "a".repeat(500),
      msg: 'Unexpected token "}" in JSON at position 123!',
      label: "Изготвяне на документа (PDF) №1",
    });
    expect((out.long as string).length).toBe(120);
    expect(out.msg).toBeUndefined();
    expect(out.label).toBe("Изготвяне на документа (PDF) №1");
  });

  it("запазва числа, булеви и плитки обекти (A/B варианти)", () => {
    const out = sanitizeFunnelProps({
      step_idx: 2.456,
      clean: true,
      ab: { quick_preview: "b" },
      nil: null,
      undef: undefined,
      nan: Number.NaN,
    });
    expect(out).toEqual({ step_idx: 2.46, clean: true, ab: { quick_preview: "b" } });
  });
});
