import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DeleteTarget = { table: string; columns: string[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Do not strand a paid user with an auto-renewing subscription after their
    // HabTastic login is gone. Google Play explicitly allows account deletion
    // flows to require subscription cancellation first, provided that step is
    // clearly explained to the user.
    const { data: renewing, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("provider,status,cancel_at_period_end")
      .eq("user_id", user.id)
      .in("status", ["active", "attention", "trialing"])
      .eq("cancel_at_period_end", false)
      .limit(1);

    if (subscriptionError) throw new Error("subscription_check_failed");
    if (renewing && renewing.length > 0) {
      return new Response(
        JSON.stringify({
          error: "subscription_cancellation_required",
          provider: renewing[0].provider,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const fail = (operation: string, table: string, message?: string) => {
      console.error(`[delete-account] ${operation} failed for ${table}`, message ?? "");
      throw new Error(`${operation}_${table}_failed`);
    };

    const deleteRows = async ({ table, columns }: DeleteTarget) => {
      const query = admin.from(table).delete();
      const result = columns.length === 1
        ? await query.eq(columns[0], user.id)
        : await query.or(columns.map((column) => `${column}.eq.${user.id}`).join(","));
      if (result.error) fail("delete", table, result.error.code);
    };

    const clearReference = async (table: string, column: string) => {
      const { error } = await admin.from(table).update({ [column]: null }).eq(column, user.id);
      if (error) fail("clear_reference", table, error.code);
    };

    // Clear nullable staff/admin references that can legitimately belong to
    // records owned by another user.
    await clearReference("community_reports", "resolved_by");
    await clearReference("payout_requests", "processed_by");
    await clearReference("premium_grants", "granted_by");

    // Delete shared/relationship rows before their parent records. This list is
    // intentionally explicit so account deletion never depends on RLS or on
    // undocumented auth-user cascades.
    const deleteTargets: DeleteTarget[] = [
      { table: "partner_checkins", columns: ["user_id"] },
      { table: "community_feed_comments", columns: ["user_id"] },
      { table: "community_feed_reactions", columns: ["user_id"] },
      { table: "community_challenge_participants", columns: ["user_id"] },
      { table: "friendships", columns: ["requester_id", "addressee_id"] },
      { table: "friend_challenges", columns: ["creator_id", "opponent_id", "winner_id"] },
      { table: "accountability_partners", columns: ["requester_id", "partner_id"] },
      { table: "user_blocks", columns: ["blocker_id", "blocked_id"] },
      { table: "user_mutes", columns: ["muter_id", "muted_id"] },
      { table: "referrals", columns: ["referrer_id", "referred_id"] },
      { table: "referral_rewards", columns: ["referrer_id"] },
      { table: "community_reports", columns: ["reporter_id", "target_id"] },

      { table: "ai_challenges", columns: ["user_id"] },
      { table: "ai_daily_coaching", columns: ["user_id"] },
      { table: "ai_weekly_reviews", columns: ["user_id"] },
      { table: "chat_messages", columns: ["user_id"] },
      { table: "client_telemetry_events", columns: ["user_id"] },
      { table: "coin_transactions", columns: ["user_id"] },
      { table: "community_clicks", columns: ["user_id"] },
      { table: "community_feed", columns: ["user_id"] },
      { table: "daily_chests", columns: ["user_id"] },
      { table: "daily_reflections", columns: ["user_id"] },
      { table: "device_tokens", columns: ["user_id"] },
      { table: "diary_entries", columns: ["user_id"] },
      { table: "feedback", columns: ["user_id"] },
      { table: "gem_transactions", columns: ["user_id"] },
      { table: "goals", columns: ["user_id"] },
      { table: "habit_verifications", columns: ["user_id"] },
      { table: "journal_entries", columns: ["user_id"] },
      { table: "journal_folders", columns: ["user_id"] },
      { table: "journal_memories", columns: ["user_id"] },
      { table: "journal_passcodes", columns: ["user_id"] },
      { table: "journal_pin_state", columns: ["user_id"] },
      { table: "leaderboard_crowns", columns: ["user_id"] },
      { table: "level_rewards_claimed", columns: ["user_id"] },
      { table: "mood_logs", columns: ["user_id"] },
      { table: "notification_log", columns: ["user_id"] },
      { table: "notification_prefs", columns: ["user_id"] },
      { table: "notifications", columns: ["user_id"] },
      { table: "profile_privacy", columns: ["user_id"] },
      { table: "push_subscriptions", columns: ["user_id"] },
      { table: "rate_limits_user", columns: ["user_id"] },
      { table: "reward_claims", columns: ["user_id"] },
      { table: "reward_eligibility", columns: ["user_id"] },
      { table: "savings_entries", columns: ["user_id"] },
      { table: "savings_challenges", columns: ["user_id"] },
      { table: "savings_goals", columns: ["user_id"] },
      { table: "shop_purchases", columns: ["user_id"] },
      { table: "shop_orders", columns: ["user_id"] },
      { table: "paystack_subscription_audit", columns: ["user_id"] },
      { table: "paystack_webhook_events", columns: ["user_id"] },
      { table: "premium_grants", columns: ["user_id"] },
      { table: "subscriptions", columns: ["user_id"] },
      { table: "user_cosmetics", columns: ["user_id"] },
      { table: "user_equipped_cosmetics", columns: ["user_id"] },
      { table: "user_roles", columns: ["user_id"] },
      { table: "weekly_scores", columns: ["user_id"] },
      { table: "weekly_summaries", columns: ["user_id"] },
      { table: "winston_celebrations", columns: ["user_id"] },
      { table: "winston_challenges", columns: ["user_id"] },
      { table: "winston_memory", columns: ["user_id"] },
      { table: "winston_money_actions", columns: ["user_id"] },
      { table: "xp_transactions", columns: ["user_id"] },
      { table: "challenges", columns: ["user_id"] },
      { table: "habits", columns: ["user_id"] },

      // Profile is last because several feature tables derive ownership or
      // entitlement checks from it.
      { table: "profiles", columns: ["user_id"] },
    ];

    for (const target of deleteTargets) await deleteRows(target);

    // Storage deletion is part of the request too. Fail closed: if we cannot
    // clear the user's avatar folder, keep the auth account so the request can
    // be retried instead of falsely reporting a completed deletion.
    // Walk the whole folder (paged, including sub-folders) so no avatar is left behind.
    const collectPaths = async (prefix: string, depth = 0): Promise<string[]> => {
      if (depth > 5) return [];
      const out: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data: page, error: listError } = await admin.storage
          .from("avatars")
          .list(prefix, { limit: 100, offset });
        if (listError) fail("list_storage", "avatars", listError.message);
        for (const item of page ?? []) {
          const path = `${prefix}/${item.name}`;
          // Folders come back without an id.
          if (item.id === null || item.id === undefined) out.push(...await collectPaths(path, depth + 1));
          else out.push(path);
        }
        if (!page || page.length < 100) break;
      }
      return out;
    };
    const paths = await collectPaths(user.id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: removeError } = await admin.storage.from("avatars").remove(paths.slice(i, i + 100));
      if (removeError) fail("delete_storage", "avatars", removeError.message);
    }

    // Finally remove the authentication identity and email address.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[delete-account] unexpected error", e);
    return new Response(
      JSON.stringify({ error: "account_delete_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
