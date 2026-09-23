// Тест на СЪЩИНСКИЯ обработчик на draft-claim (не на споделения помощник и не на
// текстов ред в изходния код): прихваща `Deno.serve`, подменя `fetch` и доказва,
// че при ограничени идентификатори в запазеното съдържание НЯМА нито един
// променящ заявка (PATCH/POST към `anonymous_drafts` / `saved_documents`).
//
// Мрежата е напълно подменена: нито една заявка не излиза навън.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashToken } from "../_shared/draft-token.ts";

const EGN_BAD_CHECKSUM = "8012129999"; // синтетично, достоверна дата, грешна сума
const DRAFT_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_ID = "99999999-8888-4777-8666-555555555555";

interface Recorded {
  method: string;
  url: string;
}

async function runHandler(
  payload: Record<string, unknown>,
  rowOverrides: Record<string, unknown> = {},
): Promise<{ res: Response; calls: Recorded[] }> {
  const calls: Recorded[] = [];
  const tokenHash = await hashToken(TOKEN);

  const row = {
    id: DRAFT_ID,
    token_hash: tokenHash,
    flow: "wizard",
    doc_key: "dogovor-za-naem",
    route: "/wizard/dogovor-za-naem",
    payload,
    step_idx: 2,
    has_result: true,
    claimed_by: null,
    saved_doc_id: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...rowOverrides,
  };

  const origFetch = globalThis.fetch;
  const origServe = Deno.serve;
  const envBackup = new Map<string, string | undefined>();
  const setEnv = (k: string, v: string) => {
    envBackup.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  };
  setEnv("SUPABASE_URL", "http://stub.local");
  setEnv("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");

  const captured: { h: ((req: Request) => Promise<Response> | Response) | null } = { h: null };
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (h: any) => {
    captured.h = typeof h === "function" ? h : h?.handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });

    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(json({ id: USER_ID, aud: "authenticated", email: "t@example.test" }));
    }
    if (url.includes("/rpc/rate_limit_check")) {
      return Promise.resolve(json({ ok: true, remaining: 29, retry_after_s: 0 }));
    }
    if (url.includes("/rest/v1/anonymous_drafts") && method === "GET") {
      return Promise.resolve(json(row));
    }
    // Всяко друго обръщение е неочаквана промяна — тестът ще го улови в твърденията.
    return Promise.resolve(json({}, 200));
  }) as typeof fetch;

  try {
    // Кеширан модул: собствен ключ за всяко зареждане не е нужен — `Deno.serve`
    // се извиква при първото зареждане, затова прихващаме и го преизползваме.
    await import("./index.ts");
    assert(captured.h, "Deno.serve не беше извикан");
    const res = await captured.h(
      new Request("http://stub.local/draft-claim", {
        method: "POST",
        headers: { Authorization: "Bearer stub-jwt", "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: DRAFT_ID, claim_token: TOKEN }),
      }),
    );
    return { res, calls };
  } finally {
    globalThis.fetch = origFetch;
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = origServe;
    for (const [k, v] of envBackup) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

function mutations(calls: Recorded[]): Recorded[] {
  return calls.filter(
    (c) =>
      (c.url.includes("anonymous_drafts") || c.url.includes("saved_documents")) &&
      c.method !== "GET",
  );
}

Deno.test("блокиран сценарий: 422 и НУЛА променящи заявки към базата", async () => {
  const { res, calls } = await runHandler({
    answers: { seller: `ЕГН ${EGN_BAD_CHECKSUM}` },
    result: { body: "Договор…" },
  });

  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.code, "restricted_identifier_blocked");
  assertEquals(body.restricted_kinds, ["egn"]);
  // Никъде не се връща самата стойност.
  assert(!JSON.stringify(body).includes(EGN_BAD_CHECKSUM));

  assertEquals(mutations(calls), [], `неочаквани промени: ${JSON.stringify(mutations(calls))}`);
});

Deno.test("вече материализиран документ се възпроизвежда идемпотентно (без 422)", async () => {
  const { res } = await runHandler(
    {},
    { claimed_by: USER_ID, saved_doc_id: DRAFT_ID, payload: {} },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.saved_doc_id, DRAFT_ID);
});

Deno.test("чисто съдържание НЕ се блокира (преградата не спира редовен claim)", async () => {
  const { res } = await runHandler(
    { answers: { seller: "ЕГН: [ЕГН]" } },
    { claimed_by: USER_ID, has_result: false },
  );
  assert(res.status !== 422, `неочакван 422: ${await res.text()}`);
});
