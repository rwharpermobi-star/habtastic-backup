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
  name: "list_habits",
  title: "List habits",
  description:
    "List all habits belonging to the signed-in HabTastic user, including emoji, category, frequency, difficulty, and the recorded completion dates.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("habits")
      .select("id, name, emoji, category, frequency, difficulty, custom_days, completions, reminder_time, reminder_enabled")
      .order("created_at", { ascending: true });
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const habits = (data ?? []).map((h) => ({
      ...h,
      completions_count: Array.isArray(h.completions) ? h.completions.length : 0,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(habits, null, 2) }],
      structuredContent: { habits },
    };
  },
});
