/** Pure, secret-free ENV projection. No DB, Stripe or legal runtime imports. */
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";

export type EnvReader = (key: string) => string | undefined;

/** Последната миграция, която ТРЯБВА да е приложена преди включване. */
export const PRODUCT_EXPECTED_MIGRATION =
  "0026_product_acl_hardening" as const;

export const PRODUCT_INTEGRATION_ENV = Object.freeze({
  gatewayKey: "LOVABLE_API_KEY",
  zeroRetention: "PRODUCT_AI_ZERO_RETENTION_VERIFIED",
  checkoutEnabled: "PRODUCT_CHECKOUT_ENABLED",
  fulfillmentEnabled: "PRODUCT_AI_FULFILLMENT_ENABLED",
  supabaseUrl: "SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  sandboxStripeKey: "STRIPE_SANDBOX_API_KEY",
  liveStripeKey: "STRIPE_LIVE_API_KEY",
  sandboxWebhookSecret: "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  liveWebhookSecret: "PAYMENTS_LIVE_WEBHOOK_SECRET",
});

/** Флаг е включен САМО при точен низ "true". Всичко друго е затворено. */
function flag(env: EnvReader, key: string): boolean {
  return env(key) === "true";
}

function present(env: EnvReader, key: string): boolean {
  const value = env(key);
  return typeof value === "string" && value.trim().length > 0;
}

export interface ProductStripeEnvironmentConfig {
  readonly apiKeyPresent: boolean;
  readonly webhookSecretPresent: boolean;
  readonly configured: boolean;
}

export interface ProductIntegrationConfig {
  readonly checkoutEnabled: boolean;
  readonly fulfillmentEnabled: boolean;
  readonly gatewayKeyPresent: boolean;
  readonly zeroRetentionVerified: boolean;
  readonly databaseBound: boolean;
  readonly stripe: Readonly<Record<"sandbox" | "live", ProductStripeEnvironmentConfig>>;
  readonly policyVersion: typeof PRODUCT_GENERATION_POLICY_VERSION;
  readonly expectedMigration: typeof PRODUCT_EXPECTED_MIGRATION;
}

export function readProductIntegrationConfig(env: EnvReader): ProductIntegrationConfig {
  const stripeFor = (
    apiKey: string,
    webhookSecret: string,
  ): ProductStripeEnvironmentConfig => {
    const apiKeyPresent = present(env, apiKey);
    const webhookSecretPresent = present(env, webhookSecret);
    return Object.freeze({
      apiKeyPresent,
      webhookSecretPresent,
      configured: apiKeyPresent && webhookSecretPresent,
    });
  };
  return Object.freeze({
    // Затворено по подразбиране: включването е ИЗРИЧНО действие на оператора.
    checkoutEnabled: flag(env, PRODUCT_INTEGRATION_ENV.checkoutEnabled),
    fulfillmentEnabled: flag(env, PRODUCT_INTEGRATION_ENV.fulfillmentEnabled),
    gatewayKeyPresent: present(env, PRODUCT_INTEGRATION_ENV.gatewayKey),
    zeroRetentionVerified: flag(env, PRODUCT_INTEGRATION_ENV.zeroRetention),
    databaseBound: present(env, PRODUCT_INTEGRATION_ENV.supabaseUrl) &&
      present(env, PRODUCT_INTEGRATION_ENV.serviceRoleKey),
    stripe: Object.freeze({
      sandbox: stripeFor(
        PRODUCT_INTEGRATION_ENV.sandboxStripeKey,
        PRODUCT_INTEGRATION_ENV.sandboxWebhookSecret,
      ),
      live: stripeFor(
        PRODUCT_INTEGRATION_ENV.liveStripeKey,
        PRODUCT_INTEGRATION_ENV.liveWebhookSecret,
      ),
    }),
    policyVersion: PRODUCT_GENERATION_POLICY_VERSION,
    expectedMigration: PRODUCT_EXPECTED_MIGRATION,
  });
}

