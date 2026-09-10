import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ConsentMissingError,
  LEGAL_VERSIONS,
  ReturnUrlError,
  buildProductReturnUrl,
  consentMetadata,
  readConsent,
  requireProductConsent,
} from "./purchase-consent.ts";

const ALL_TRUE = {
  termsAccepted: true,
  aiAckAccepted: true,
  immediatePerformanceConsent: true,
  withdrawalLossAcknowledged: true,
};

Deno.test("липсващо съгласие спира покупката", () => {
  assertThrows(() => requireProductConsent({}), ConsentMissingError);
  for (const key of Object.keys(ALL_TRUE)) {
    assertThrows(
      () => requireProductConsent({ ...ALL_TRUE, [key]: false }),
      ConsentMissingError,
    );
  }
  assertEquals(requireProductConsent(ALL_TRUE).termsAccepted, true);
});

Deno.test("само истински boolean true се приема", () => {
  const c = readConsent({ termsAccepted: "true", aiAckAccepted: 1 });
  assertEquals(c.termsAccepted, false);
  assertEquals(c.aiAckAccepted, false);
});

Deno.test("метаданните не измислят съгласие", () => {
  const meta = consentMetadata(readConsent({}));
  assertEquals(meta.ai_ack_accepted, "false");
  assertEquals(meta.terms_accepted, "false");
  assertEquals(meta.terms_version, LEGAL_VERSIONS.terms);
});

Deno.test("произволен external origin се отказва", () => {
  assertThrows(() => buildProductReturnUrl("https://evil.example", "/produkti/rezultat"), ReturnUrlError);
  assertThrows(() => buildProductReturnUrl(undefined, "/produkti/rezultat"), ReturnUrlError);
  assertThrows(() => buildProductReturnUrl("https://dogovori.net", "produkti"), ReturnUrlError);
  assertEquals(
    buildProductReturnUrl("https://dogovori.net/", "/produkti/rezultat"),
    "https://dogovori.net/produkti/rezultat",
  );
});
