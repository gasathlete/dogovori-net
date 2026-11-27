import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PRODUCT_TRUSTED_SOURCE_BRIDGE, productTrustedSourceBlockers } from "./product-trusted-source.ts";
import {
  productFulfillmentBlockers,
  productIntegrationMessage,
  readProductIntegrationConfig,
} from "./product-integration.ts";

Deno.test("trusted source bridge is closed and frozen in source", () => {
  assertEquals(PRODUCT_TRUSTED_SOURCE_BRIDGE.available, false);
  assert(Object.isFrozen(PRODUCT_TRUSTED_SOURCE_BRIDGE));
  assertEquals(productTrustedSourceBlockers(), ["trusted_source_unavailable"]);
});

Deno.test("no env value (incl. invented flags) opens the trusted source bridge", () => {
  const env: Record<string, string> = {
    PRODUCT_TRUSTED_SOURCE_VERIFIED: "true",
    PRODUCT_SOURCE_ATTESTATION_ENABLED: "true",
    PRODUCT_CHECKOUT_ENABLED: "true",
    PRODUCT_AI_FULFILLMENT_ENABLED: "true",
    PRODUCT_AI_ZERO_RETENTION_VERIFIED: "true",
  };
  const config = readProductIntegrationConfig((k) => env[k]);
  // Конфигурационните врати не знаят за произхода; затварянето е отделно.
  assert(!("trustedSourceVerified" in config));
  assertEquals(productFulfillmentBlockers(config).includes("trusted_source_unavailable" as never), false);
  assertEquals(productTrustedSourceBlockers(), ["trusted_source_unavailable"]);
});

Deno.test("trusted source message is honest and payment-safe", () => {
  const m = productIntegrationMessage("trusted_source_unavailable");
  assert(m.includes("Плащане не се извършва"));
  assert(!/провер(ен|ихме)|готово|AI/i.test(m.replace("Проверката", "")));
});
