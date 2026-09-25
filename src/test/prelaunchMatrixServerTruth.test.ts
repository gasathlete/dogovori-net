import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEPLOYED_READINESS, PRELAUNCH_MATRIX } from "@/lib/prelaunchMatrix";

const src = (f: string) => readFileSync(`supabase/functions/${f}/index.ts`, "utf8");
const row = (t: string) => PRELAUNCH_MATRIX.find((r) => r.target.includes(t))!;

describe("матрицата не противоречи на сървърния код", () => {
  it.each([
    ["assistant-chat", "assistant", "/assistant (ново"],
    ["create-checkout", "subscription_checkout", "нов абонамент"],
    ["create-strict-unlock-checkout", "strict_unlock_checkout", "строго отключване"],
  ])("%s има сървърна преграда и редът е client+server", (fn, flag, target) => {
    expect(src(fn)).toContain(`isNewProcessingOpen("${flag}")`);
    expect(row(target).control).toBe("client+server");
    expect(row(target).note).not.toMatch(/пряко достъпен/);
  });
  it("разгърнатата готовност не се твърди", () => {
    expect(DEPLOYED_READINESS).toBe("NOT_VERIFIED");
    for (const r of PRELAUNCH_MATRIX) expect(r.note).not.toMatch(/приложена миграция|deployed|разгърнат/i);
  });
});
