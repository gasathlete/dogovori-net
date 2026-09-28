import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOwnerStoragePath, targetBelongsToOwner } from "./share-target.ts";
import { SafeFetchError, safeFetchText } from "./safe-fetch.ts";
import { buildCors, isProjectPreviewHost } from "./cors.ts";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

Deno.test("share target: only the owner's own folder and row", () => {
  assert(isOwnerStoragePath(`${A}/x.pdf`, A));
  assert(isOwnerStoragePath(`${A}/signed/l.pdf`, A));
  for (const p of [`${B}/x.pdf`, `/${A}/x.pdf`, `${A}/../${B}/x.pdf`, `${A}`, `${A}//x`, `${A}\\x`, "", null, 5]) {
    assert(!isOwnerStoragePath(p, A), String(p));
  }
  assert(!isOwnerStoragePath(`${A}/x`, "not-a-uuid"));
  assert(targetBelongsToOwner({ user_id: A }, A));
  assert(!targetBelongsToOwner({ user_id: B }, A));
  assert(!targetBelongsToOwner(null, A));
});

function fakeFetch(map: Record<string, () => Response>): typeof fetch {
  return ((url: string) => {
    const h = map[url];
    if (!h) throw new Error("unexpected " + url);
    return Promise.resolve(h());
  }) as unknown as typeof fetch;
}
const HOSTS = new Set(["lex.bg"]);

Deno.test("safe fetch: follows allowed redirect, blocks off-list redirect", async () => {
  const ok = await safeFetchText("https://lex.bg/a", {
    allowedHosts: HOSTS,
    fetchImpl: fakeFetch({
      "https://lex.bg/a": () => new Response(null, { status: 302, headers: { location: "/b" } }),
      "https://lex.bg/b": () => new Response("закон"),
    }),
  });
  assertEquals(ok.text, "закон");
  const e = await assertRejects(() => safeFetchText("https://lex.bg/a", {
    allowedHosts: HOSTS,
    fetchImpl: fakeFetch({ "https://lex.bg/a": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }) }),
  }), SafeFetchError);
  assertEquals(e.code, "host_not_allowed");
});

Deno.test("safe fetch: redirect loop, oversize body, credentials in URL", async () => {
  const loop = await assertRejects(() => safeFetchText("https://lex.bg/a", {
    allowedHosts: HOSTS, maxRedirects: 2,
    fetchImpl: fakeFetch({ "https://lex.bg/a": () => new Response(null, { status: 301, headers: { location: "/a" } }) }),
  }), SafeFetchError);
  assertEquals(loop.code, "too_many_redirects");
  const big = await assertRejects(() => safeFetchText("https://lex.bg/a", {
    allowedHosts: HOSTS, maxBytes: 4,
    fetchImpl: fakeFetch({ "https://lex.bg/a": () => new Response("0123456789") }),
  }), SafeFetchError);
  assertEquals(big.code, "body_too_large");
  const cred = await assertRejects(() => safeFetchText("https://u:p@lex.bg/a", { allowedHosts: HOSTS }), SafeFetchError);
  assertEquals(cred.code, "host_not_allowed");
});

Deno.test("cors: only this project's origins", () => {
  const P = "6b2da12e-e1d6-4f97-8549-b632fb66ddd1";
  assert(isProjectPreviewHost(`id-preview--${P}.lovable.app`));
  assert(isProjectPreviewHost(`${P}.lovableproject.com`));
  for (const h of ["evil.lovable.app", "x.lovable.dev", `${P}.evil.lovable.app`, `evil${P}.lovable.app`]) {
    assert(!isProjectPreviewHost(h), h);
  }
  const allow = (o: string) =>
    (buildCors(new Request("https://x", { headers: { origin: o } })) as Record<string, string>)["Access-Control-Allow-Origin"];
  assertEquals(allow("https://attacker.lovable.app"), "https://dogovori.net");
  assertEquals(allow("https://dogovori.net"), "https://dogovori.net");
  assertEquals(allow(`https://id-preview--${P}.lovable.app`), `https://id-preview--${P}.lovable.app`);
});
