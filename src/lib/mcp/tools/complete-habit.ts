import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

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
  name: "complete_habit",
  title: "Mark habit complete",
  description:
    "Mark a habit as completed for today. Provide the habit id from `list_habits` or `today_status`. Idempotent — completing an already-done habit is a no-op.",
  inputSchema: {
    habit_id: z.string().uuid().describe("The habit id (uuid) from list_habits."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ habit_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: habit, error: fetchErr } = await supabase
      .from("habits")
      .select("id, name, completions")
      .eq("id", habit_id)
      .maybeSingle();
    if (fetchErr)
      return { content: [{ type: "text", text: fetchErr.message }], isError: true };
    if (!habit)
      return { content: [{ type: "text", text: "Habit not found" }], isError: true };
    const today = todayISO();
    const current = Array.isArray(habit.completions) ? habit.completions : [];
    if (current.includes(today)) {
      return {
        content: [{ type: "text", text: `"${habit.name}" was already completed today.` }],
        structuredContent: { habit_id, already_completed: true, date: today },
      };
    }
    const next = [...current, today];
    const { error: updateErr } = await supabase
      .from("habits")
      .update({ completions: next })
      .eq("id", habit_id);
    if (updateErr)
      return { content: [{ type: "text", text: updateErr.message }], isError: true };
    return {
      content: [{ type: "text", text: `Marked "${habit.name}" complete for ${today}.` }],
      structuredContent: { habit_id, already_completed: false, date: today },
    };
  },
});
