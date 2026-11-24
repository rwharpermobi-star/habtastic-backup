import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listHabitsTool from "./tools/list-habits";
import todayStatusTool from "./tools/today-status";
import completeHabitTool from "./tools/complete-habit";
import getStatsTool from "./tools/get-stats";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref
// (VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time — import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "habtastic-mcp",
  title: "HabTastic",
  version: "0.1.0",
  instructions:
    "Tools to read and update the signed-in HabTastic user's habits. Use `list_habits` or `today_status` to inspect what the user is tracking, `complete_habit` to mark one done for today, and `get_stats` to summarize recent completion.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listHabitsTool, todayStatusTool, completeHabitTool, getStatsTool],
});
