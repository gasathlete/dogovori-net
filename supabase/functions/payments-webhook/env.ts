/**
 * Проверка на `?env=` за webhook-а.
 *
 * Fail-closed: липсващ или различен от точно "sandbox"/"live" параметър НЕ
 * стига до избор на доставчик, проверка на подпис или база. Връща се общ 400.
 */
export type WebhookEnv = "sandbox" | "live";

export function parseWebhookEnv(rawUrl: string): WebhookEnv | null {
  let value: string | null = null;
  try {
    value = new URL(rawUrl).searchParams.get("env");
  } catch {
    return null;
  }
  return value === "sandbox" || value === "live" ? value : null;
}

export function invalidEnvResponse(): Response {
  return new Response(JSON.stringify({ error: "invalid_request" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
