import { describe, expect, it } from "vitest";
import { staticRequest } from "../../supabase/functions/_shared/static-catalog";

const request = (body: string) => new Request("https://example.test/static-catalog", { method: "POST", body });

describe("static catalog HTTP input stays strict, unlike recoverable AI output", () => {
  it("accepts a complete object with explicitly allowed keys", async () => {
    await expect(staticRequest(request('{"action":"catalog"}'), ["action"]))
      .resolves.toEqual({ action: "catalog" });
  });

  it.each(['{"action":"catalog"', '```json\n{"action":"catalog"}\n```', '{"action":"catalog",}'])
    ("rejects malformed input without AI JSON repair: %s", async (body) => {
      await expect(staticRequest(request(body), ["action"]))
        .rejects.toMatchObject({ code: "invalid_body", status: 400 });
    });

  it.each(['[]', 'null', '{"action":"catalog","sql":"forbidden"}'])
    ("rejects non-objects or unknown fields: %s", async (body) => {
      await expect(staticRequest(request(body), ["action"]))
        .rejects.toMatchObject({ code: "invalid_body", status: 400 });
    });

  it("rejects a streamed body larger than the limit before parsing", async () => {
    await expect(staticRequest(request('{"action":"catalog"}'), ["action"], 8))
      .rejects.toMatchObject({ code: "request_too_large", status: 413 });
  });
});