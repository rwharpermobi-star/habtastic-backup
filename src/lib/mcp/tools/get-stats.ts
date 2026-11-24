import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default defineTool({
  name: "get_stats",
  title: "Get habit stats",
  description:
    "Summarize the signed-in user's habit completion over the last N days (default 7). Returns per-habit completion rate and overall totals.",
  inputSchema: {
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("Lookback window in days (1-90). Defaults to 7."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const window = days ?? 7;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("habits")
      .select("id, name, emoji, completions");
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const windowDates = new Set<string>();
    for (let i = 0; i < window; i++) windowDates.add(daysAgoISO(i));
    const perHabit = (data ?? []).map((h) => {
      const done = (Array.isArray(h.completions) ? h.completions : []).filter((d: string) =>
        windowDates.has(d),
      ).length;
      return {
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        completed_days: done,
        total_days: window,
        rate: window > 0 ? Math.round((done / window) * 100) : 0,
      };
    });
    const overall = perHabit.length
      ? Math.round(
          perHabit.reduce((sum, h) => sum + h.rate, 0) / perHabit.length,
        )
      : 0;
    const summary = { window_days: window, overall_rate: overall, habits: perHabit };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
