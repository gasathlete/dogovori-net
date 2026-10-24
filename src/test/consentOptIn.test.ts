/**
 * Съгласията са доказателство: нито един запис не се губи при грешка, повторният
 * опит е идемпотентен, а маркетингът се записва само при изричен избор.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock, getUserMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    from: () => ({ upsert: upsertMock }),
  },
}));

import { PENDING_CONSENTS_KEY, flushPendingConsents, recordConsents } from "@/lib/consents";
import {
  isMarketingEligible,
  marketingStatusFromEvents,
  normalizeMarketingStatus,
} from "@/lib/marketingConsent";

type Row = { consent_type: string; granted: boolean; consent_event_id: string };

function rowsOf(call: number): Row[] {
  return upsertMock.mock.calls[call][0] as Row[];
}

beforeEach(() => {
  upsertMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
  sessionStorage.clear();
});

/** Точната форма на доказателството при регистрация. */
const VALID = {
  user_id: "u1",
  terms: true,
  privacy: true,
  age_18: true,
  operational_notifications: true,
};

function stash(payload: unknown) {
  sessionStorage.setItem(PENDING_CONSENTS_KEY, JSON.stringify(payload));
}

describe("flushPendingConsents — надеждност", () => {
  it("при неуспешен запис запазва данните за повторен опит", async () => {
    stash({ ...VALID, marketing: true });
    upsertMock.mockResolvedValue({ error: { message: "network" } });

    const res = await flushPendingConsents();
    expect(res.ok).toBe(false);
    expect(sessionStorage.getItem(PENDING_CONSENTS_KEY)).toBeTruthy();
  });

  it("повторният опит ползва същия идентификатор и успехът изчиства данните", async () => {
    stash({ ...VALID, marketing: true });
    upsertMock.mockResolvedValueOnce({ error: { message: "network" } });
    await flushPendingConsents();
    const firstId = rowsOf(0)[0].consent_event_id;

    upsertMock.mockResolvedValueOnce({ error: null });
    const res = await flushPendingConsents();
    expect(res.ok).toBe(true);
    expect(rowsOf(1)[0].consent_event_id).toBe(firstId);
    expect(sessionStorage.getItem(PENDING_CONSENTS_KEY)).toBeNull();
  });

  it("повторно изпълнение след успех не създава второ събитие", async () => {
    stash({ ...VALID, marketing: true });
    upsertMock.mockResolvedValue({ error: null });
    await flushPendingConsents();
    upsertMock.mockClear();
    const res = await flushPendingConsents();
    expect(res.ok).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("записът е идемпотентен по (потребител, вид, събитие)", async () => {
    upsertMock.mockResolvedValue({ error: null });
    await recordConsents([{ consent_type: "terms", granted: true }]);
    expect(upsertMock.mock.calls[0][1]).toMatchObject({
      onConflict: "user_id,consent_type,consent_event_id",
      ignoreDuplicates: true,
    });
  });

  it("неотметнат маркетинг не записва съгласие", async () => {
    stash(VALID);
    upsertMock.mockResolvedValue({ error: null });
    await flushPendingConsents();
    const types = rowsOf(0).map((r) => r.consent_type);
    expect(types).not.toContain("marketing");
    expect(types).toEqual(
      expect.arrayContaining(["terms", "privacy", "age_18", "operational_notifications"]),
    );
  });

  it("повредени данни се изхвърлят без да се измисля съгласие", async () => {
    sessionStorage.setItem(PENDING_CONSENTS_KEY, "не-json");
    const res = await flushPendingConsents();
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_CONSENTS_KEY)).toBeNull();
  });
});

describe("flushPendingConsents — строга форма на доказателството", () => {
  const malformed: Array<[string, unknown]> = [
    ["празен обект", {}],
    ["частични задължителни полета", { terms: true, privacy: true }],
    ["липсващо operational_notifications", { terms: true, privacy: true, age_18: true }],
    ["грешен тип на булев флаг", { ...VALID, terms: "true" }],
    ["изрично false за задължително съгласие", { ...VALID, age_18: false }],
    ["невалиден маркетингов флаг", { ...VALID, marketing: "да" }],
    ["невалиден event_id", { ...VALID, event_id: "не-uuid" }],
  ];

  for (const [name, payload] of malformed) {
    it(`${name} не записва нищо`, async () => {
      stash(payload);
      upsertMock.mockResolvedValue({ error: null });
      const res = await flushPendingConsents();
      expect(res.ok).toBe(false);
      expect(upsertMock).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PENDING_CONSENTS_KEY)).toBeNull();
    });
  }

  it("допълнителни метаданни не отменят валидното доказателство", async () => {
    stash({ ...VALID, ts: 123, source: "signup" });
    upsertMock.mockResolvedValue({ error: null });
    const res = await flushPendingConsents();
    expect(res.ok).toBe(true);
  });

  it("невъзможност да се запази новият event_id спира записа", async () => {
    stash(VALID);
    upsertMock.mockResolvedValue({ error: null });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const res = await flushPendingConsents();
    setItem.mockRestore();
    expect(res).toMatchObject({ ok: false, reason: "storage-unavailable" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_CONSENTS_KEY)).toBeTruthy();
  });

  it("грешката при запис не се представя като успех", async () => {
    upsertMock.mockResolvedValue({ error: { message: "db down" } });
    const res = await recordConsents([{ consent_type: "privacy", granted: true }]);
    expect(res.ok).toBe(false);
  });
});

describe("допустимост за имейл маркетинг — само изричен opt-in", () => {
  it("последно съгласие true → opt_in", () => {
    expect(marketingStatusFromEvents([
      { granted: false, granted_at: "2026-01-01T00:00:00Z" },
      { granted: true, granted_at: "2026-02-01T00:00:00Z" },
    ])).toBe("opt_in");
  });

  it("отказ след съгласие → opt_out", () => {
    expect(marketingStatusFromEvents([
      { granted: true, granted_at: "2026-01-01T00:00:00Z" },
      { granted: false, granted_at: "2026-03-01T00:00:00Z" },
    ])).toBe("opt_out");
  });

  it("без запис → unknown и без право на кампании", () => {
    expect(marketingStatusFromEvents([])).toBe("unknown");
    expect(isMarketingEligible("unknown")).toBe(false);
    expect(isMarketingEligible("opt_out")).toBe(false);
    expect(isMarketingEligible("opt_in")).toBe(true);
  });

  it("остарял интерфейс не може да превърне липсата на избор в съгласие", () => {
    expect(normalizeMarketingStatus(undefined)).toBe("unknown");
    expect(normalizeMarketingStatus(false)).toBe("unknown");
    expect(normalizeMarketingStatus("opt_in")).toBe("opt_in");
  });
});
