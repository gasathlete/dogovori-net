import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  TEAM_ENV_MISMATCH_CODE,
  TeamEnvironmentMismatchError,
  assertTeamEnvironment,
  requireTeamAdmin,
} from "./team-env.ts";
import { mustAffectRows, mustSucceed } from "./db-guard.ts";

Deno.test("matching environment passes", () => {
  assertTeamEnvironment("live", "live");
  assertTeamEnvironment("sandbox", "sandbox");
});

Deno.test("mismatched / missing environment throws bounded error", () => {
  for (const stored of ["sandbox", "live", null, undefined, "", 1]) {
    const requested = stored === "live" ? "sandbox" : "live";
    if (stored === requested) continue;
    const err = assertThrows(() => assertTeamEnvironment(stored, requested)) as TeamEnvironmentMismatchError;
    assertEquals(err.message, TEAM_ENV_MISMATCH_CODE);
  }
});

Deno.test("requireTeamAdmin fails closed on RPC error", async () => {
  await assertRejects(
    () => requireTeamAdmin({ rpc: () => Promise.resolve({ data: true, error: { message: "rpc down" } }) }, "u1", "t1"),
    Error,
    "Not allowed",
  );
});

Deno.test("requireTeamAdmin fails closed on non-true data", async () => {
  for (const data of [false, null, undefined, "true", 1]) {
    await assertRejects(
      () => requireTeamAdmin({ rpc: () => Promise.resolve({ data, error: null }) }, "u1", "t1"),
      Error,
      "Not allowed",
    );
  }
});

Deno.test("requireTeamAdmin passes on data === true", async () => {
  await requireTeamAdmin({ rpc: () => Promise.resolve({ data: true, error: null }) }, "u1", "t1");
});

Deno.test("mustSucceed throws on error, returns data otherwise", () => {
  assertEquals(mustSucceed({ data: { a: 1 }, error: null }, "x"), { a: 1 });
  assertThrows(() => mustSucceed({ data: null, error: { message: "bad" } }, "x"), Error, "x failed: bad");
});

Deno.test("mustAffectRows detects zero rows", () => {
  mustAffectRows({ data: [{ id: 1 }], error: null }, "x");
  mustAffectRows({ data: { id: 1 }, error: null }, "x");
  assertThrows(() => mustAffectRows({ data: [], error: null }, "x"), Error, "x matched no rows");
  assertThrows(() => mustAffectRows({ data: null, error: null }, "x"), Error, "x matched no rows");
});
