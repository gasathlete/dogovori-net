export type LaunchGateClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { live_enabled?: boolean } | null; error: unknown }>;
      };
    };
  };
};

/** Only new LIVE sessions depend on this service-controlled switch. Missing/error = closed. */
export async function publicProductLaunchAllowed(db: LaunchGateClient, environment: "sandbox" | "live"): Promise<boolean> {
  if (environment === "sandbox") return true; // Caller must enforce the existing staff check.
  try {
    const { data, error } = await db.from("product_launch_control").select("live_enabled").eq("id", "public_products").maybeSingle();
    return !error && data?.live_enabled === true;
  } catch {
    return false;
  }
}