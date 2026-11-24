/**
 * Адресът за връщане след плащане не идва от браузъра и не приема произволен
 * поддомейн. Тестът заключва точния списък.
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ALLOWED_RETURN_ORIGINS,
  ReturnUrlError,
  buildProductReturnUrl,
  productReturnUrl,
} from "./purchase-consent.ts";

Deno.test("никой чужд или случаен адрес не се приема", () => {
  assertEquals(
    buildProductReturnUrl("https://dogovori.net", "/produkti/rezultat"),
    "https://dogovori.net/produkti/rezultat",
  );
  // Без шаблон „кой да е *.lovable.app“.
  assertThrows(
    () => buildProductReturnUrl("https://attacker.lovable.app", "/produkti/rezultat"),
    ReturnUrlError,
  );
  assertThrows(() => buildProductReturnUrl("https://evil.example", "/x"), ReturnUrlError);
  assertThrows(() => buildProductReturnUrl(undefined, "/x"), ReturnUrlError);
  assertThrows(() => buildProductReturnUrl("https://dogovori.net", "produkti"), ReturnUrlError);
  for (const origin of ALLOWED_RETURN_ORIGINS) {
    assertEquals(buildProductReturnUrl(origin, "/a"), `${origin}/a`);
  }
});

Deno.test("продуктовият адрес се гради от конфигурация, не от заявка", () => {
  assertEquals(
    productReturnUrl("https://www.dogovori.net", "/produkti/rezultat"),
    "https://www.dogovori.net/produkti/rezultat",
  );
  // Непозната конфигурация пада към основния публичен адрес, не към клиента.
  assertEquals(
    productReturnUrl("https://attacker.example", "/produkti/rezultat"),
    "https://dogovori.net/produkti/rezultat",
  );
  assertEquals(
    productReturnUrl(undefined, "/produkti/rezultat"),
    "https://dogovori.net/produkti/rezultat",
  );
});

Deno.test("връщането е към същата среда, от която е тръгнал потребителят", async () => {
  const { productReturnUrl } = await import("./purchase-consent.ts");
  const preview = "https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app";
  assertEquals(productReturnUrl("https://dogovori.net", "/r", preview, "sandbox"), `${preview}/r`);
  assertEquals(productReturnUrl("https://dogovori.net", "/r", "https://www.dogovori.net", "live"), "https://www.dogovori.net/r");
  // Preview origin с LIVE и обратно не се приемат — пада към конфигурацията.
  assertEquals(productReturnUrl("https://dogovori.net", "/r", preview, "live"), "https://dogovori.net/r");
  assertEquals(productReturnUrl("https://dogovori.net", "/r", "https://evil.example", "sandbox"), "https://dogovori.net/r");
});
