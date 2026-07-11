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
  name: "list_my_documents",
  title: "List my saved documents",
  description:
    "Lists the signed-in user's saved legal documents (contracts, blanks, uploads) with id, title, kind and last-updated timestamp. Newest first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of documents to return (1-50, default 20)."),
    search: z
      .string()
      .trim()
      .optional()
      .describe("Optional case-insensitive substring to filter document titles."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("saved_documents")
      .select("id, title, kind, updated_at, created_at")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (search) query = query.ilike("title", `%${search}%`);
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
                    `- ${r.title || "(untitled)"} — kind=${r.kind} — id=${r.id} — updated=${r.updated_at}`,
                )
                .join("\n")
            : "No saved documents found.",
        },
      ],
      structuredContent: { documents: rows },
    };
  },
});
