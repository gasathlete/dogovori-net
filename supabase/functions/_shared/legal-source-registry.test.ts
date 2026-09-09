// N0 — тестове за затворения регистър и безопасното извличане.
// Всичко е локално и синтетично: без мрежа, без DB, без AI.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ALLOWED_ORIGINS,
  enabledSources,
  getRegistryEntry,
  isAllowedOrigin,
  LEGAL_SOURCE_REGISTRY,
  registrySyncRows,
} from "./legal-source-registry.ts";
import {
  buildSourceUrl,
  canonicalizeUrl,
  safeFetchSource,
  validateUrlForEntry,
} from "./legal-fetch-guard.ts";
import { chunkedRes, res, testEntry } from "./legal-source.fixtures.ts";

// ---------- Регистър ----------

Deno.test("registry: Lex.bg НЕ е официален наблюдаван източник", () => {
  for (const e of LEGAL_SOURCE_REGISTRY) {
    assert(!e.origin.includes("lex.bg"), `неочакван lex.bg origin: ${e.origin}`);
  }
  assert(!ALLOWED_ORIGINS.some((o) => o.includes("lex.bg")));
});

Deno.test("registry: изисканите официални източници присъстват", () => {
  const keys = LEGAL_SOURCE_REGISTRY.map((e) => e.sourceKey);
  for (const k of [
    "bg_state_gazette",
    "bg_national_assembly",
    "bg_strategy_consultations",
    "eu_eurlex_oj",
    "eu_cellar_metadata",
  ]) {
    assert(keys.includes(k), `липсва източник ${k}`);
  }
  assertEquals(getRegistryEntry("bg_state_gazette")?.authorityTier, "official_promulgation");
  assertEquals(getRegistryEntry("bg_strategy_consultations")?.watchOnly, true);
  assertEquals(
    getRegistryEntry("eu_cellar_metadata")?.authorityTier,
    "official_eu_consolidated_helper",
  );
});

Deno.test("registry: непотвърден endpoint => disabled + needs_access_review", () => {
  for (const e of LEGAL_SOURCE_REGISTRY) {
    if (e.reviewStatus !== "approved") assertEquals(e.enabled, false);
    assert(e.origin.startsWith("https://"));
    assert(e.entryPath.startsWith("/"));
  }
  // Fail-closed: нищо не се пуска без одобрен достъп.
  assertEquals(enabledSources().length, 0);
});

Deno.test("registry: sync редовете са идемпотентни и fail-closed", () => {
  const a = registrySyncRows();
  const b = registrySyncRows();
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  for (const row of a) {
    assert(row.enabled === false || row.review_status === "approved");
    assert(row.review_notes.length <= 2000);
    assert(/^[a-z][a-z0-9_]{2,59}$/.test(row.source_key));
  }
});

// ---------- Origin / URL allowlist ----------

Deno.test("guard: URL от потребител се отхвърля", () => {
  const entry = testEntry();
  for (const bad of [
    "https://evil.example/inject",
    "https://lex.bg/laws/ldoc/2121934337",
    "http://dv.parliament.bg/DVWeb/index.faces",
    "file:///etc/passwd",
    "https://dv.parliament.bg.attacker.example/DVWeb/",
  ]) {
    const r = validateUrlForEntry(entry, bad);
    assertEquals(r.ok, false, `неочаквано приет URL: ${bad}`);
  }
  assert(!isAllowedOrigin("https://evil.example"));
});

Deno.test("guard: път извън адаптера се отхвърля", () => {
  const entry = testEntry();
  const bad = validateUrlForEntry(entry, "https://dv.parliament.bg/comments/user/42");
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.errorCode, "path_not_allowed");
  const good = buildSourceUrl(entry, "/DVWeb/index.faces");
  assertEquals(good.ok, true);
});

Deno.test("guard: каноничен URL е детерминистичен", () => {
  const a = canonicalizeUrl("https://DV.parliament.BG:443/DVWeb/index.faces?#frag");
  const b = canonicalizeUrl("https://dv.parliament.bg/DVWeb/index.faces");
  assertEquals(a, b);
});

// ---------- Redirect ----------

Deno.test("guard: cross-origin redirect се отказва fail-closed", async () => {
  const entry = testEntry();
  const r = await safeFetchSource(entry, {
    fetchImpl: () =>
      Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }),
      ),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "redirect_origin_changed");
});

Deno.test("guard: downgrade към http при redirect се отказва", async () => {
  const r = await safeFetchSource(testEntry(), {
    fetchImpl: () =>
      Promise.resolve(
        new Response(null, {
          status: 301,
          headers: { location: "http://dv.parliament.bg/DVWeb/index.faces" },
        }),
      ),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "redirect_origin_changed");
});

Deno.test("guard: same-origin redirect в разрешен път се следва", async () => {
  let hop = 0;
  const r = await safeFetchSource(testEntry(), {
    fetchImpl: () => {
      hop++;
      if (hop === 1) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://dv.parliament.bg/DVWeb/other.faces" },
          }),
        );
      }
      return Promise.resolve(res("<html><body><ul><li>брой 1 от 01.01.2026 г.</li></ul></body></html>"));
    },
  });
  assertEquals(r.ok, true);
  if (r.ok && !r.notModified) {
    assertEquals(r.canonicalUrl, "https://dv.parliament.bg/DVWeb/other.faces");
  }
});

Deno.test("guard: безкраен redirect цикъл се спира", async () => {
  const r = await safeFetchSource(testEntry(), {
    fetchImpl: () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://dv.parliament.bg/DVWeb/loop.faces" },
        }),
      ),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "too_many_redirects");
});

// ---------- Тавани ----------

Deno.test("guard: таван на байтовете (declared и реален)", async () => {
  const entry = testEntry({ maxBytes: 100 });
  const declared = await safeFetchSource(entry, {
    fetchImpl: () => Promise.resolve(res("x", { headers: { "content-length": "999999" } })),
  });
  assertEquals(declared.ok, false);
  if (!declared.ok) assertEquals(declared.errorCode, "response_too_large");

  const actual = await safeFetchSource(entry, {
    fetchImpl: () => Promise.resolve(res("y".repeat(500))),
  });
  assertEquals(actual.ok, false);
  if (!actual.ok) assertEquals(actual.errorCode, "response_too_large");
});

Deno.test("guard: content-type allowlist", async () => {
  const r = await safeFetchSource(testEntry(), {
    fetchImpl: () =>
      Promise.resolve(res("%PDF-1.7", { headers: { "content-type": "application/pdf" } })),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "content_type_not_allowed");
});

Deno.test("guard: timeout се налага и не изтича тяло", async () => {
  const entry = testEntry({ timeoutMs: 30 });
  const r = await safeFetchSource(entry, {
    fetchImpl: (_u, init) =>
      new Promise((_resolve, reject) => {
        const signal = (init as RequestInit).signal!;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.errorCode, "timeout");
    assertEquals(Object.keys(r).sort().join(","), "errorCode,ok,status");
  }
});

Deno.test("guard: HTTP грешка не връща тяло на източника", async () => {
  const r = await safeFetchSource(testEntry(), {
    fetchImpl: () => Promise.resolve(res("<html>SECRET ERROR BODY</html>", { status: 503 })),
  });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.errorCode, "http_error");
    assertEquals(r.status, 503);
    assert(!JSON.stringify(r).includes("SECRET"));
  }
});

Deno.test("guard: изключен източник никога не се извлича", async () => {
  let called = false;
  const r = await safeFetchSource(testEntry({ enabled: false, reviewStatus: "needs_access_review" }), {
    fetchImpl: () => {
      called = true;
      return Promise.resolve(res("<html></html>"));
    },
  });
  assertEquals(called, false);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "source_disabled");
});

Deno.test("guard: 304 Not Modified се разпознава и носи ETag", async () => {
  const r = await safeFetchSource(testEntry(), {
    etag: 'W/"abc"',
    fetchImpl: (_u, init) => {
      const h = new Headers((init as RequestInit).headers);
      assertEquals(h.get("If-None-Match"), 'W/"abc"');
      return Promise.resolve(new Response(null, { status: 304, headers: { etag: 'W/"abc"' } }));
    },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.notModified, true);
    if (r.notModified) assertEquals(r.etag, 'W/"abc"');
  }
});

Deno.test("guard: checksum е детерминистичен за идентично тяло", async () => {
  const fetchImpl = () => Promise.resolve(res("<html><body><ul><li>брой 5 от 05.05.2026 г.</li></ul></body></html>"));
  const a = await safeFetchSource(testEntry(), { fetchImpl });
  const b = await safeFetchSource(testEntry(), { fetchImpl });
  assert(a.ok && b.ok && !a.notModified && !b.notModified);
  if (a.ok && b.ok && !a.notModified && !b.notModified) {
    assertEquals(a.checksum, b.checksum);
    assertEquals(a.checksum.length, 64);
  }
});

// ---------- Poточно четене с таван (chunked) ----------

Deno.test("guard: chunked oversized отговор се прекъсва и потокът се cancel-ва", async () => {
  const entry = testEntry({ maxBytes: 100 });
  const { response, state } = chunkedRes(["a".repeat(60), "b".repeat(60), "c".repeat(60)]);
  const r = await safeFetchSource(entry, { fetchImpl: () => Promise.resolve(response) });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "response_too_large");
  assertEquals(state.cancelled, true);
});

Deno.test("guard: точна граница на байтовете се приема, +1 се отказва", async () => {
  const entry = testEntry({ maxBytes: 100 });
  const exact = chunkedRes(["x".repeat(50), "x".repeat(50)]);
  const ok = await safeFetchSource(entry, { fetchImpl: () => Promise.resolve(exact.response) });
  assert(ok.ok && !ok.notModified);
  if (ok.ok && !ok.notModified) assertEquals(ok.byteCount, 100);
  assertEquals(exact.state.cancelled, false);

  const over = chunkedRes(["x".repeat(50), "x".repeat(50), "x"]);
  const bad = await safeFetchSource(entry, { fetchImpl: () => Promise.resolve(over.response) });
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.errorCode, "response_too_large");
});

Deno.test("guard: multibyte UTF-8 през границата на chunk се декодира коректно", async () => {
  const bytes = new TextEncoder().encode("<html>Държавен вестник — брой 61</html>");
  const cut = 8; // среща средата на многобайтов символ
  const { response } = chunkedRes([bytes.slice(0, cut), bytes.slice(cut)]);
  const r = await safeFetchSource(testEntry(), { fetchImpl: () => Promise.resolve(response) });
  assert(r.ok && !r.notModified);
  if (r.ok && !r.notModified) {
    assertEquals(r.body, "<html>Държавен вестник — брой 61</html>");
    assertEquals(r.byteCount, bytes.byteLength);
    assert(!r.body.includes("\uFFFD"));
  }
});

Deno.test("guard: безкраен поток се cancel-ва при надхвърлен таван", async () => {
  const entry = testEntry({ maxBytes: 500 });
  let cancelled = false;
  let pulled = 0;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      // Предпазен клапан за теста: без cancel потокът е практически безкраен.
      if (pulled > 5000) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode("z".repeat(50)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const r = await safeFetchSource(entry, {
    fetchImpl: () =>
      Promise.resolve(
        new Response(stream, { status: 200, headers: { "content-type": "text/html" } }),
      ),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "response_too_large");
  assertEquals(cancelled, true);
  assert(pulled < 5000, "потокът е спрян рано, без да се чете целият отговор");
});

// ---------- Segment-safe път ----------

Deno.test("guard: prefix \"/\" разрешава само root", () => {
  const entry = testEntry({ allowedPathPrefixes: ["/"], entryPath: "/" });
  const root = validateUrlForEntry(entry, "https://dv.parliament.bg/");
  assertEquals(root.ok, true);
  for (const bad of ["https://dv.parliament.bg/anything", "https://dv.parliament.bg/DVWeb/x"]) {
    const r = validateUrlForEntry(entry, bad);
    assertEquals(r.ok, false, bad);
    if (!r.ok) assertEquals(r.errorCode, "path_not_allowed");
  }
});

Deno.test("guard: префикс без наклонена черта е segment-safe", () => {
  const entry = testEntry({
    origin: "https://www.parliament.bg",
    allowedPathPrefixes: ["/bg/laws"],
    entryPath: "/bg/laws",
  });
  assertEquals(validateUrlForEntry(entry, "https://www.parliament.bg/bg/laws").ok, true);
  assertEquals(validateUrlForEntry(entry, "https://www.parliament.bg/bg/laws/2026/61").ok, true);
  const sneaky = validateUrlForEntry(entry, "https://www.parliament.bg/bg/lawsmith");
  assertEquals(sneaky.ok, false);
  if (!sneaky.ok) assertEquals(sneaky.errorCode, "path_not_allowed");
});

Deno.test("guard: redirect към подобен префикс се отказва", async () => {
  const entry = testEntry({
    origin: "https://www.parliament.bg",
    allowedPathPrefixes: ["/bg/laws"],
    entryPath: "/bg/laws",
  });
  const r = await safeFetchSource(entry, {
    fetchImpl: () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.parliament.bg/bg/lawsmith/index" },
        }),
      ),
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "redirect_origin_changed");
});
