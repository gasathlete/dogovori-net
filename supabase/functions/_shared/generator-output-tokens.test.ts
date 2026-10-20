import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeGeneratedOutput, finalizeServiceTokens } from "./generator-output-tokens.ts";
import { redactForAI } from "./redact.ts";
import { isRedactableField, RESERVED_PLACEHOLDER_RE } from "./redact-fields.ts";
import { flattenGeneratedContract } from "./generated-document-quality.ts";
import { reviewContentDigest } from "./review-grant.ts";

Deno.test("точните маркери от мапинга се възстановяват (гол и в скоби)", () => {
  const r = redactForAI("ЕГН 7501020033, имейл ivan@example.com");
  const egn = Object.keys(r.mapping).find((k) => k.startsWith("<EGN"))!;
  const mail = Object.keys(r.mapping).find((k) => k.startsWith("<EMAIL"))!;
  const out = finalizeServiceTokens(`А: ${egn}; Б: [${mail}]`, r.mapping);
  assertEquals(out, "А: 7501020033; Б: ivan@example.com");
});

Deno.test("различни потребители: чужд маркер не получава стойност", () => {
  const a = redactForAI("ЕГН 7501020033");
  const b = redactForAI("ЕГН 8001010044");
  const tokenB = Object.keys(b.mapping)[0];
  const out = finalizeServiceTokens(`ЕГН: ${tokenB}`, a.mapping);
  assertEquals(out, "ЕГН: [ЕГН]");
  assert(!out.includes("7501020033") && !out.includes("8001010044"));
});

Deno.test("празен мапинг: измислени маркери стават видими полета", () => {
  const out = finalizeServiceTokens(
    "<EGN_2>, <ADDRESS_1>, [<EMAIL_1>], [<IBAN>], <PHONE_3_abcxyz>, <EIC_1>",
    {},
  );
  assertEquals(out, "[ЕГН], [Адрес], [Имейл], [IBAN], [Телефон], [ЕИК]");
  assert(!RESERVED_PLACEHOLDER_RE.test(out));
});

Deno.test("възстановена стойност не се пренаписва повторно", () => {
  const out = finalizeServiceTokens("<NAME_1_q>", { "<NAME_1_q>": "текст <EGN_9> буквално" });
  assertEquals(out, "текст <EGN_9> буквално");
});

Deno.test("суми, дати, клаузи и непознати маркери остават непроменени", () => {
  const s = "Чл. 3. (1) Заплата 2 500 € от 01.11.2026 г. [<МЯСТО_НА_РАБОТА>] [Срок] <X_1>";
  assertEquals(finalizeServiceTokens(s, {}), s);
});

Deno.test("финалният текст минава ревизионната проверка и digest е стабилен", async () => {
  const r = redactForAI("Иван Петров Иванов, ЕГН 7501020033");
  const keys = Object.keys(r.mapping);
  const contract = {
    title: "Трудов договор",
    clauses: [{ number: "1", title: "Страни", body: `Служител: ${keys.join(" ")}, адрес <ADDRESS_1>, [<IBAN>]` }],
  };
  const final = finalizeGeneratedOutput({ contract }, r.mapping).contract;
  const text = flattenGeneratedContract(final);
  assert(isRedactableField(text), "текстът трябва да е приемлив за ревизия");
  assert(text.includes("7501020033") && text.includes("[Адрес]") && text.includes("[IBAN]"));
  assertEquals(await reviewContentDigest(text), await reviewContentDigest(flattenGeneratedContract(final)));
  // Променен текст → различен digest (grant няма да съвпадне).
  assert((await reviewContentDigest(text + " Х")) !== (await reviewContentDigest(text)));
});

Deno.test("външен вход със запазен маркер все още се отказва", () => {
  assertEquals(isRedactableField("Платете на <EMAIL_1>"), false);
});

Deno.test("пропускът се обвързва с текста, който клиентът изпраща", async () => {
  const { renderCanonicalPlainText } = await import("./generated-document-quality.ts");
  const { issueGrantForGeneratedContent, verifyReviewGrant } = await import("./review-grant.ts");
  const contract = finalizeGeneratedOutput(
    { title: "Трудов договор", clauses: [{ number: "1", title: "Страни", body: "ЕГН <EGN_1>" }] },
    {},
  );
  const text = renderCanonicalPlainText(contract);
  assert(isRedactableField(text));
  const g = await issueGrantForGeneratedContent({ secret: "x".repeat(64), ownerId: "u1", documentText: text });
  assert(g);
  const digest = await reviewContentDigest(text);
  assertEquals(g.payload.content_digest, digest);
  assert(digest !== await reviewContentDigest(flattenGeneratedContract(contract)));
  assert((await verifyReviewGrant({ grant: g, secret: "x".repeat(64), contentDigest: digest, subject: "u1", expectedOwner: "u1" })).ok);
  assert(!(await verifyReviewGrant({ grant: g, secret: "x".repeat(64), contentDigest: await reviewContentDigest(text + " changed"), subject: "u1", expectedOwner: "u1" })).ok);
  assert(!(await verifyReviewGrant({ grant: g, secret: "x".repeat(64), contentDigest: digest, subject: "u2", expectedOwner: "u2" })).ok);
});

Deno.test("точната стойност с кавички и нов ред се възстановява без JSON round-trip", () => {
  const original = 'Име "Пример"\nвтори ред';
  const result = finalizeGeneratedOutput({ contract: { preamble: "<NAME_1_aabb>" }, risk: { note: "<EMAIL_2>" } }, { "<NAME_1_aabb>": original });
  assertEquals(result.contract.preamble, original);
  assertEquals(result.risk.note, "[Имейл]");
});
