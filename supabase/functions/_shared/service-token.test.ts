import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bearerToken,
  isExactServiceRoleToken,
  timingSafeEqualString,
} from "./service-token.ts";

const KEY = "service-role-key-abcdef";

Deno.test("exact match passes, near-miss candidates fail", () => {
  assert(timingSafeEqualString(KEY, KEY));
  // по-къс кандидат
  assert(!timingSafeEqualString(KEY.slice(0, -1), KEY));
  // по-дълъг кандидат
  assert(!timingSafeEqualString(`${KEY}x`, KEY));
  // празен кандидат
  assert(!timingSafeEqualString("", KEY));
  // сменен регистър
  assert(!timingSafeEqualString(KEY.toUpperCase(), KEY));
  // еднаква дължина, един различен байт (начало, среда, край)
  assert(!timingSafeEqualString(`X${KEY.slice(1)}`, KEY));
  assert(!timingSafeEqualString(`${KEY.slice(0, 10)}X${KEY.slice(11)}`, KEY));
  assert(!timingSafeEqualString(`${KEY.slice(0, -1)}X`, KEY));
  // празен ключ не бива да минава с празен кандидат през публичния гейт
  assert(timingSafeEqualString("", ""));
});

Deno.test("isExactServiceRoleToken is fail-closed", () => {
  assert(isExactServiceRoleToken(KEY, KEY));
  assert(!isExactServiceRoleToken("", KEY));
  assert(!isExactServiceRoleToken(KEY, ""));
  assert(!isExactServiceRoleToken(null, KEY));
  assert(!isExactServiceRoleToken(undefined, KEY));
  assert(!isExactServiceRoleToken(null, null));
  assert(!isExactServiceRoleToken(`${KEY} `, KEY));
});

Deno.test("bearerToken extracts only Bearer tokens", () => {
  const mk = (auth?: string) =>
    new Request("https://example.test/", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    });
  assertEquals(bearerToken(mk(`Bearer ${KEY}`)), KEY);
  assertEquals(bearerToken(mk(KEY)), "");
  assertEquals(bearerToken(mk()), "");
});

Deno.test("implementation has no length-mismatch early return", async () => {
  const src = await Deno.readTextFile("supabase/functions/_shared/service-token.ts");
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = code.slice(code.indexOf("export function timingSafeEqualString"));
  const fnBody = body.slice(0, body.indexOf("\n}") + 2);
  assert(
    !/length\s*!==\s*[\w.]*length[\s\S]{0,40}return\s+false/.test(fnBody),
    "no length-mismatch early return allowed",
  );
  assert(
    /diff\s*=\s*[\w.]*length\s*\^\s*[\w.]*length/.test(fnBody),
    "accumulator must be initialized with the length difference",
  );
  const returns = fnBody.match(/return\b/g) ?? [];
  assertEquals(returns.length, 1, "only the final comparison may return");
});
