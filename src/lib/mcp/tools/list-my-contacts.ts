import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_contacts",
  title: "List my contacts",
  description:
    "Lists the signed-in user's saved contacts (individuals and companies used as counterparties in documents). Optional search filter on name/EIK/email.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max results (1-100)."),
    search: z.string().trim().optional().describe("Optional substring to filter by name, EIK or email."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("contacts")
      .select("id, type, name, eik, vat_number, email, phone, address, updated_at")
      .eq("user_id", ctx.getUserId())
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (search) {
      const like = `%${search}%`;
      query = query.or(`name.ilike.${like},eik.ilike.${like},email.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rows.length
            ? rows
                .map(
                  (r) =>
                    `- ${r.name} (${r.type})${r.eik ? ` — EIK ${r.eik}` : ""}${r.email ? ` — ${r.email}` : ""} — id=${r.id}`,
                )
                .join("\n")
            : "No contacts found.",
        },
      ],
      structuredContent: { contacts: rows },
    };
  },
});
