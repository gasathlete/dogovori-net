import { describe, expect, it, vi, afterEach } from "vitest";
import { parseAiJsonWithRetry } from "./ai-json-retry.ts";

const base = {
  messages: [
    { role: "system" as const, content: "sys" },
    { role: "user" as const, content: "изготви договор за наем" },
  ],
  model: "google/gemini-2.5-flash",
  apiKey: "test-key",
  fn: "unit-test",
};

function mockGateway(...contents: (string | null)[]) {
  const fetchMock = vi.fn(async () => {
    const next = contents.shift();
    if (next === null) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: next } }] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("parseAiJsonWithRetry", () => {
  it("parses valid JSON without any extra AI call", async () => {
    const fetchMock = mockGateway();
    const res = await parseAiJsonWithRetry({ ...base, content: '{"contract":{"title":"X"}}' });
    expect(res.stage).toBe("direct");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries with a repair call when parsing fails", async () => {
    const fetchMock = mockGateway('{"contract":{"title":"X"}}');
    const res = await parseAiJsonWithRetry({ ...base, content: "не мога да върна JSON" });
    expect(res.stage).toBe("repair");
    expect((res.parsed as any).contract.title).toBe("X");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates with the original request when repair also fails", async () => {
    const fetchMock = mockGateway("still not json", '{"contract":{"title":"Y"}}');
    const res = await parseAiJsonWithRetry({ ...base, content: "напълно счупено" });
    expect(res.stage).toBe("regenerate");
    expect((res.parsed as any).contract.title).toBe("Y");
    // Second call must still carry the user's original request.
    const body = JSON.parse((fetchMock.mock.calls[1] as any)[1].body);
    expect(body.messages.some((m: any) => m.content.includes("договор за наем"))).toBe(true);
  });

  it("regenerates when the parsed object fails validation", async () => {
    mockGateway("{}", '{"contract":{"title":"Z"}}');
    const res = await parseAiJsonWithRetry({
      ...base,
      content: '{"risk":{}}',
      validate: (p: any) => !!p?.contract,
    });
    expect(res.stage).toBe("regenerate");
  });

  it("throws a friendly error after every attempt fails", async () => {
    mockGateway(null, null);
    await expect(
      parseAiJsonWithRetry({ ...base, content: "счупено" }),
    ).rejects.toThrow(/не може да бъде анализиран/);
  });
});
