import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ARTICLE_POLICY_VERSION,
  buildArticleEvidence,
  canonicalArticleContent,
  sha256Hex,
  toArticleSourceRefs,
} from "./article-evidence.ts";

const article = {
  title: "Неустойка по ЗЗД",
  summary: "Кратко",
  intro: "Въведение",
  sections: [{ heading: "Чл. 92", body: "Текст" }],
  faq: [{ q: "Въпрос?", a: "Отговор" }],
  takeaways: ["Изводът"],
};

Deno.test("каноничното съдържание е стабилно и покрива всички части", () => {
  const a = canonicalArticleContent(article);
  const b = canonicalArticleContent(JSON.parse(JSON.stringify(article)));
  assertEquals(a, b);
  for (const needle of ["Неустойка", "Чл. 92", "Въпрос?", "Изводът"]) assert(a.includes(needle));
});

Deno.test("промяна в съдържанието променя хеша", async () => {
  const e1 = await buildArticleEvidence({
    articleId: "11111111-1111-1111-1111-111111111111",
    article,
    activeSystemPrompt: "SYS",
    model: "m",
    generator: "admin-generate-article",
    sources: [],
  });
  const e2 = await buildArticleEvidence({
    articleId: "11111111-1111-1111-1111-111111111111",
    article: { ...article, intro: "Друго въведение" },
    activeSystemPrompt: "SYS",
    model: "m",
    generator: "admin-generate-article",
    sources: [],
  });
  assert(e1.content_hash !== e2.content_hash);
  assertEquals(e1.prompt_digest, await sha256Hex("SYS"));
  assertEquals(e1.policy_version, ARTICLE_POLICY_VERSION);
  assertEquals(e1.verified, false);
});

Deno.test("източниците пазят версия и снапшот дайджест, когато са известни", () => {
  const refs = toArticleSourceRefs(
    [{ chunk_id: "c1", short_code: "ЗЗД" }, { chunk_id: "c2", short_code: "ТЗ" }, { short_code: "х" }],
    new Map([["c1", { version: "2026-01", snapshot_digest: "abc" }]]),
  );
  assertEquals(refs.length, 2);
  assertEquals(refs[0], { chunk_id: "c1", short_code: "ЗЗД", version: "2026-01", snapshot_digest: "abc" });
  assertEquals(refs[1].version, null);
});

Deno.test("човешка проверка се прави чрез сравнение на хеша", async () => {
  const e = await buildArticleEvidence({
    articleId: "22222222-2222-2222-2222-222222222222",
    article,
    activeSystemPrompt: "SYS",
    model: "m",
    generator: "admin-generate-article",
    sources: [],
  });
  assertEquals(e.content_hash, await sha256Hex(canonicalArticleContent(article)));
});
