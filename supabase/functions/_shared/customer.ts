import type Stripe from "https://esm.sh/stripe@22.0.2";

/**
 * Find or create a Stripe customer for a given Lovable userId.
 * Search by metadata.userId so the same customer is reused across purchases
 * (subscriptions + one-off), enabling the Customer Portal & refunds to work.
 */
export async function resolveOrCreateCustomer(
  stripe: Stripe,
  opts: { userId: string; email?: string },
): Promise<string> {
  const { userId, email } = opts;

  // Try search first (Stripe search has eventual consistency but is fine here).
  try {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${userId}'`,
      limit: 1,
    });
    if (found.data.length > 0) return found.data[0].id;
  } catch (e) {
    console.warn("customer search failed, falling back to create:", e);
  }

  const created = await stripe.customers.create({
    ...(email && { email }),
    metadata: { userId },
  });
  return created.id;
}
