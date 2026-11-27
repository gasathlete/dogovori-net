import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCors, isProjectPreviewHost } from "./cors.ts";

const PROJECT = "6b2da12e-e1d6-4f97-8549-b632fb66ddd1";
const accepted = (origin: string) =>
  buildCors(new Request("https://api.example.test", { headers: { origin } }))["Access-Control-Allow-Origin"];

Deno.test("CORS rejects a foreign project slug containing our public project ID", () => {
  for (const host of [
    `attacker--${PROJECT}.lovable.app`,
    `another-preview--${PROJECT}.lovable.app`,
    `id-preview--${PROJECT}.lovable.app.attacker.test`,
    `sub.id-preview--${PROJECT}.lovable.app`,
  ]) {
    assert(!isProjectPreviewHost(host), host);
    assert(accepted(`https://${host}`) !== `https://${host}`, host);
  }
});

Deno.test("CORS keeps exact public and project origins and rejects non-origin strings", () => {
  for (const origin of [
    "https://dogovori.net",
    "https://www.dogovori.net",
    `https://id-preview--${PROJECT}.lovable.app`,
    `https://${PROJECT}.lovableproject.com`,
  ]) assertEquals(accepted(origin), origin);

  for (const origin of [
    `http://id-preview--${PROJECT}.lovable.app`,
    `https://id-preview--${PROJECT}.lovable.app/path`,
    `https://user@id-preview--${PROJECT}.lovable.app`,
    `https://id-preview--${PROJECT}.lovable.app:8443`,
    "null",
  ]) assert(accepted(origin) !== origin, origin);
});
