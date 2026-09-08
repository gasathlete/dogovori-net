// Безплатната резервация: месечен прозорец, липсващ ред, реална конкуренция,
// истински таван и разликата между инфраструктурна грешка и изчерпан лимит.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FREE_AI_MESSAGES,
  MONTHLY_WINDOW_MS,
  reserveAssistantOperation,
  type ReservationDeps,
} from "./orchestration.ts";

const USER = "user-1";
const NOW = Date.parse("2026-03-01T00:00:00.000Z");

type Row = Record<string, unknown> | null;

/** Фалшив `download_quota` с истинска compare-and-update семантика. */
function store(opts: {
  row: Row;
  /** Извиква се преди всеки update — симулира чужда паралелна заявка. */
  beforeUpdate?: (row: Record<string, unknown>, attempt: number) => void;
  selectError?: boolean;
  updateError?: boolean;
  upsertError?: boolean;
  defaults?: Record<string, unknown>;
}) {
  let row = opts.row;
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  let attempts = 0;

  const admin = {
    from(_table: string) {
      const eqs: Array<[string, unknown]> = [];
      let lt: [string, number] | null = null;
      let patch: Record<string, unknown> | null = null;
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { eqs.push([col, val]); return api; },
        lt: (col: string, val: number) => { lt = [col, val]; return api; },
        upsert: async () => {
          calls.push("upsert");
          if (opts.upsertError) return { data: null, error: { message: "boom" } };
          row = { user_id: USER, ai_messages_used: 0, monthly_total_used: 0, total_used: 0,
            monthly_contracts_used: 0, monthly_templates_used: 0,
            monthly_reset_at: new Date(NOW).toISOString(), ...(opts.defaults ?? {}) };
          return { data: null, error: null };
        },
        update: (p: Record<string, unknown>) => { patch = p; return api; },
        maybeSingle: async () => {
          if (patch) {
            attempts++;
            calls.push("update");
            if (opts.updateError) return { data: null, error: { message: "boom" } };
            if (row) opts.beforeUpdate?.(row as Record<string, unknown>, attempts);
            const cur = row as Record<string, unknown> | null;
            const matched = !!cur &&
              eqs.every(([c, v]) => c === "user_id" ? true : cur[c] === v) &&
              (!lt || Number(cur[lt[0]]) < lt[1]);
            if (!matched) return { data: null, error: null };
            row = { ...cur, ...patch };
            updates.push(patch);
            return { data: { ai_messages_used: (row as any).ai_messages_used }, error: null };
          }
          calls.push("select");
          if (opts.selectError) return { data: null, error: { message: "boom" } };
          return { data: row, error: null };
        },
      };
      return api;
    },
  };

  const deps: ReservationDeps = {
    admin: admin as any,
    userClient: { rpc: async () => ({ data: { ok: true }, error: null }) },
    userId: USER,
    teamId: null,
    now: () => NOW,
  };
  return { deps, calls, updates, current: () => row };
}

const fresh = (over: Record<string, unknown> = {}) => ({
  user_id: USER,
  ai_messages_used: 0,
  monthly_total_used: 4,
  total_used: 9,
  monthly_contracts_used: 2,
  monthly_templates_used: 1,
  monthly_reset_at: new Date(NOW - 1000).toISOString(),
  ...over,
});

Deno.test("в рамките на месеца: трите брояча се вдигат точно по веднъж", async () => {
  const s = store({ row: fresh() });
  assertEquals(await reserveAssistantOperation("free", s.deps), { ok: true });
  const r = s.current() as Record<string, unknown>;
  assertEquals(r.ai_messages_used, 1);
  assertEquals(r.monthly_total_used, 5);
  assertEquals(r.total_used, 10);
  assertEquals(r.monthly_contracts_used, 2);
});

Deno.test("след 30 дни месечните броячи се нулират, а чатът е първата операция", async () => {
  const s = store({
    row: fresh({ monthly_reset_at: new Date(NOW - MONTHLY_WINDOW_MS - 1).toISOString() }),
  });
  assertEquals(await reserveAssistantOperation("free", s.deps), { ok: true });
  const r = s.current() as Record<string, unknown>;
  assertEquals(r.monthly_total_used, 1);
  assertEquals(r.monthly_contracts_used, 0);
  assertEquals(r.monthly_templates_used, 0);
  assertEquals(r.monthly_reset_at, new Date(NOW).toISOString());
  assertEquals(r.ai_messages_used, 1);
  assertEquals(r.total_used, 10);
});

Deno.test("липсващ ред: създава се и се прочита авторитетно преди CAS", async () => {
  const s = store({ row: null });
  assertEquals(await reserveAssistantOperation("free", s.deps), { ok: true });
  assert(s.calls.includes("upsert"));
  // select → upsert → select (авторитетно) → update
  assertEquals(s.calls, ["select", "upsert", "select", "update"]);
  assertEquals((s.current() as Record<string, unknown>).ai_messages_used, 1);
});

Deno.test("загубено сравнение се повтаря: две валидни заявки под тавана минават", async () => {
  const s = store({
    row: fresh(),
    beforeUpdate: (row, attempt) => {
      if (attempt === 1) row.ai_messages_used = 1; // чужда заявка е успяла
    },
  });
  assertEquals(await reserveAssistantOperation("free", s.deps), { ok: true });
  assertEquals((s.current() as Record<string, unknown>).ai_messages_used, 2);
  assertEquals(s.calls.filter((c) => c === "update").length, 2);
});

Deno.test("истинският таван е 3 и не се надхвърля", async () => {
  const s = store({ row: fresh({ ai_messages_used: FREE_AI_MESSAGES }) });
  const r = await reserveAssistantOperation("free", s.deps);
  assertEquals((r as { code: string }).code, "ai_free_limit_reached");
  assertEquals((r as { status: number }).status, 402);
  assertEquals(s.calls.filter((c) => c === "update").length, 0);
  assertEquals(FREE_AI_MESSAGES, 3);
});

Deno.test("грешка при четене → 503 quota_unavailable, не изчерпан лимит", async () => {
  const s = store({ row: fresh(), selectError: true });
  const r = await reserveAssistantOperation("free", s.deps);
  assertEquals((r as { code: string }).code, "quota_unavailable");
  assertEquals((r as { status: number }).status, 503);
});

Deno.test("грешка при запис → 503 quota_unavailable", async () => {
  const s = store({ row: fresh(), updateError: true });
  const r = await reserveAssistantOperation("free", s.deps);
  assertEquals((r as { code: string }).code, "quota_unavailable");
  assertEquals((r as { status: number }).status, 503);
});

Deno.test("постоянен конфликт под тавана не се обявява за изчерпан лимит", async () => {
  const s = store({
    row: fresh(),
    beforeUpdate: (row) => { row.total_used = Number(row.total_used) + 100; },
  });
  const r = await reserveAssistantOperation("free", s.deps);
  assertEquals((r as { code: string }).code, "quota_unavailable");
});
