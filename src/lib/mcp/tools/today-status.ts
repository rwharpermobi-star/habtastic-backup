import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default defineTool({
  name: "today_status",
  title: "Today's habit status",
  description:
    "Return today's habit list for the signed-in user, marking which have been completed and which are still pending.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("habits")
      .select("id, name, emoji, frequency, custom_days, completions");
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const today = todayISO();
    const dow = new Date().getDay();
    const rows = (data ?? [])
      .filter((h) => {
        if (h.frequency === "daily") return true;
        if (h.frequency === "custom" && Array.isArray(h.custom_days))
          return h.custom_days.includes(dow);
        return true;
      })
      .map((h) => ({
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        completed: Array.isArray(h.completions) && h.completions.includes(today),
      }));
    const summary = {
      date: today,
      total: rows.length,
      completed: rows.filter((r) => r.completed).length,
      habits: rows,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
