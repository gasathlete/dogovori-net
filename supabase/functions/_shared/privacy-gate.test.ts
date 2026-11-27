import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RAW_IMAGE_INGRESS_ALLOWED,
  RAW_IMAGE_INGRESS_BLOCKED_CODE,
  rawImageIngressBlockedResponse,
} from "./privacy-gate.ts";

Deno.test("приемането на изображения е спряно", () => {
  assertEquals(RAW_IMAGE_INGRESS_ALLOWED, false);
});

Deno.test("отказът е 422 с безопасен код и без сурови данни", async () => {
  const res = rawImageIngressBlockedResponse({ "Access-Control-Allow-Origin": "*" });
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.code, RAW_IMAGE_INGRESS_BLOCKED_CODE);
  assertEquals(typeof body.error === "string" && body.error.length > 20, true);
});
