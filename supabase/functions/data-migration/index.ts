// Admin-gated one-click data export / import between Supabase projects.
//
// Usage (no cross-project credentials ever reach the browser):
//   1. Point the app at the SOURCE backend, POST { action: "export" } and save
//      the returned JSON bundle.
//   2. Switch the app to the TARGET backend (see the backend switcher), then
//      POST { action: "import", bundle } with the saved file.
//
// Every call requires a signed-in user holding the `admin` role. All privileged
// work happens here with the service-role key.
//
// Password hashes are NOT exportable via the Auth admin API, so imported users
// are created without a password and must use "forgot password" once. User ids
// are remapped by email so every `user_id` column stays consistent.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type MigrationTable = {
  name: string;
  conflict: string;
  userColumns: readonly string[];
  allowedColumns: readonly string[];
};

/**
 * Tables migrated, in dependency order. Incoming JSON is NEVER spread directly
 * into a service-role write. Each table has an explicit field allowlist.
 */
const TABLES: MigrationTable[] = [
  {
    name: "profiles",
    conflict: "user_id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "name", "coach_gender", "xp", "theme",
      "onboarding_complete", "created_at", "updated_at", "avatar_url",
      "is_premium", "premium_until", "daily_ai_messages", "last_ai_reset",
      "streak_freezes", "freeze_used_dates", "coins", "gems",
      "unlocked_themes", "unlocked_effects", "ai_avatar_credits_used",
      "ai_avatar_credits_reset_at", "trial_started_at", "lifestyle_data",
    ],
  },
  {
    name: "habits",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "name", "emoji", "color", "frequency", "category",
      "difficulty", "reminder_time", "custom_days", "completions", "created_at",
      "verification_enabled", "verification_question", "reminder_enabled",
      "reminder_tone", "sound_mode",
    ],
  },
  {
    name: "challenges",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "title", "description", "emoji", "duration",
      "habit_name", "start_date", "completed_days", "reward_xp",
      "reward_badge", "created_at",
    ],
  },
  {
    name: "goals",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "title", "description", "target_value",
      "current_value", "unit", "frequency", "status", "deadline",
      "created_at", "updated_at",
    ],
  },
  {
    name: "journal_folders",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: ["id", "user_id", "name", "emoji", "color", "created_at"],
  },
  {
    name: "journal_entries",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "content", "mood", "mood_intensity", "topics",
      "ai_feedback", "is_voice", "folder_id", "created_at",
    ],
  },
  {
    name: "mood_logs",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "habit_id", "mood", "intensity", "date", "created_at",
    ],
  },
  {
    name: "xp_transactions",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "delta", "reason", "metadata", "balance_after", "created_at",
    ],
  },
  {
    name: "coin_transactions",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "delta", "reason", "metadata", "balance_after", "created_at",
    ],
  },
  {
    name: "gem_transactions",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "delta", "reason", "metadata", "balance_after", "created_at",
    ],
  },
  {
    name: "weekly_scores",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: ["id", "user_id", "week_start", "score", "rank", "created_at"],
  },
  {
    name: "client_telemetry_events",
    conflict: "id",
    userColumns: ["user_id"],
    allowedColumns: [
      "id", "user_id", "event_name", "properties", "session_id", "created_at",
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickAllowed(
  row: Record<string, unknown>,
  allowedColumns: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const column of allowedColumns) {
    if (Object.prototype.hasOwnProperty.call(row, column)) next[column] = row[column];
  }
  return next;
}

const PAGE = 1000;
const CHUNK = 500;

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function requireAdmin(req: Request, db: SupabaseClient) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token.split(".").length !== 3) return { error: json({ error: "unauthorized" }, 401) };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: "unauthorized" }, 401) };
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (!isAdmin) return { error: json({ error: "forbidden" }, 403) };
  return { userId: data.user.id };
}

async function exportAll(db: SupabaseClient) {
  const users: { id: string; email: string | null; created_at: string; metadata: unknown }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      users.push({ id: u.id, email: u.email ?? null, created_at: u.created_at, metadata: u.user_metadata ?? {} });
    }
    if (data.users.length < 200) break;
  }

  const tables: Record<string, unknown[]> = {};
  const skipped: Record<string, string> = {};
  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(table.name).select("*").range(from, from + PAGE - 1);
      if (error) {
        console.error("[data-migration] table export failed", { table: table.name, code: error.code });
        skipped[table.name] = "export_failed";
        break;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (!skipped[table.name]) tables[table.name] = rows;
  }

  return {
    format: "habtastic.migration.v1",
    exported_at: new Date().toISOString(),
    source_url: Deno.env.get("SUPABASE_URL"),
    users,
    tables,
    skipped,
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  };
}

async function importAll(db: SupabaseClient, bundle: any, createUsers: boolean) {
  if (bundle?.format !== "habtastic.migration.v1") {
    return { error: json({ error: "unsupported_bundle_format" }, 400) };
  }

  // Map source user ids -> target user ids (matched/created by email).
  const idMap = new Map<string, string>();
  const userReport = { matched: 0, created: 0, failed: 0, skipped_no_email: 0 };

  const existing = new Map<string, string>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }

  for (const u of (bundle.users ?? []) as { id: string; email: string | null; metadata?: unknown }[]) {
    if (!u.email) { userReport.skipped_no_email++; continue; }
    const key = u.email.toLowerCase();
    const found = existing.get(key);
    if (found) { idMap.set(u.id, found); userReport.matched++; continue; }
    if (!createUsers) continue;
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      user_metadata: (u.metadata ?? {}) as Record<string, unknown>,
    });
    if (error || !data.user) { userReport.failed++; continue; }
    existing.set(key, data.user.id);
    idMap.set(u.id, data.user.id);
    userReport.created++;
  }

  const tableReport: Record<string, { inserted: number; skipped: number; error?: string }> = {};
  for (const table of TABLES) {
    const rawRows = bundle.tables?.[table.name];
    if (!Array.isArray(rawRows) || !rawRows.length) continue;
    let inserted = 0;
    let skipped = 0;
    const remapped: Record<string, unknown>[] = [];
    for (const candidate of rawRows) {
      if (!isRecord(candidate)) {
        skipped++;
        continue;
      }

      // Security boundary: only explicitly approved schema fields survive.
      const next = pickAllowed(candidate, table.allowedColumns);
      let ok = true;
      for (const col of table.userColumns) {
        const sourceId = next[col];
        if (sourceId == null) continue;
        if (typeof sourceId !== "string") { ok = false; break; }
        const mapped = idMap.get(sourceId);
        if (!mapped) { ok = false; break; }
        next[col] = mapped;
      }

      // Never issue a service-role write without the declared conflict key.
      if (!(table.conflict in next)) ok = false;

      if (ok) remapped.push(next);
      else skipped++;
    }
    for (let i = 0; i < remapped.length; i += CHUNK) {
      const slice = remapped.slice(i, i + CHUNK);
      const { error } = await db.from(table.name).upsert(slice, { onConflict: table.conflict });
      if (error) {
        console.error("[data-migration] table import failed", {
          table: table.name,
          code: error.code,
        });
        tableReport[table.name] = { inserted, skipped, error: "import_failed" };
        break;
      }
      inserted += slice.length;
    }
    tableReport[table.name] ??= { inserted, skipped };
  }

  return { report: { users: userReport, tables: tableReport } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const db = service();
    const auth = await requireAdmin(req, db);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    if (body?.action === "export") {
      return json({ ok: true, bundle: await exportAll(db) }, 200);
    }
    if (body?.action === "import") {
      const result = await importAll(db, body.bundle, body.createUsers !== false);
      if ("error" in result) return result.error;
      return json({ ok: true, ...result }, 200);
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[data-migration] internal error");
    return json({ error: "internal_error" }, 500);
  }
});
