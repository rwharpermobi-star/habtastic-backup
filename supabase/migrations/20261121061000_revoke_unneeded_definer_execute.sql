-- Security hardening (Nov 21, 2026 audit follow-up).
--
-- Every SECURITY DEFINER function in public was reviewed. All of them already
-- pin search_path, and every admin_* function checks has_role(auth.uid(),
-- 'admin') before doing anything. The remaining risk was EXECUTE rights:
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- directly, so an earlier "REVOKE ... FROM PUBLIC" did not remove them.
--
-- This migration removes EXECUTE from anon and signed-in users on functions
-- that no app screen calls: server-only helpers called by edge functions with
-- the service key, trigger functions (triggers run without EXECUTE), cron
-- jobs, and internal helpers only called from other SECURITY DEFINER
-- functions. Functions the app calls directly, and helpers used inside RLS
-- policies, keep their current grants. No function body changes.
--
-- Checked against the current app (main) and the live Android build 1.0.8:
-- neither calls any function in these lists.

DO $$
DECLARE
  r record;
  _names text[] :=
  -- Called only by edge functions with the service role key.
  ARRAY[
    'apply_google_play_revocation',
    'apply_paystack_premium_grant',
    'award_coins',
    'award_referral_retention_xp',
    'award_referral_signup_rewards',
    'award_xp',
    'begin_avatar_generation',
    'delete_email',
    'enqueue_email',
    'finish_avatar_generation',
    'fulfill_shop_order',
    'get_notification_dispatcher_secret',
    'grant_winston_ad_reward',
    'move_to_dlq',
    'paystack_events_due_for_retry',
    'qualify_referral_payment',
    'rate_limit_check_ip',
    'rate_limit_check_user',
    'read_email_batch',
    'run_retention_jobs',
    'save_bank_account',
    'start_winston_ad_reward_for'
  ]
  -- Internal helpers: only called from other SECURITY DEFINER functions,
  -- cron jobs, or no longer used by the app.
  || ARRAY[
    'adjust_gems_internal',
    'apply_referral_milestones',
    'award_celebration',
    'award_gems',
    'award_monthly_leaderboard_crowns',
    'award_referral_join_xp',
    'award_referral_milestones',
    'award_referral_signup_coins',
    'claim_rewarded_ad_reward',
    'create_notification',
    'ensure_friend_code_for',
    'ensure_referral_code_for',
    'has_active_subscription',
    'lookup_friend_by_code',
    'prune_client_telemetry',
    'prune_old_chat_messages',
    'prune_telemetry_alerts',
    'purchase_cosmetic',
    'recalc_user_community_progress',
    'referral_risk_score',
    'refresh_weekly_score_internal',
    'require_premium',
    'reward_referrer',
    'spend_coins',
    'spend_gems',
    'update_profile_internal',
    'validate_referral_code',
    'winston_ad_bonus_today',
    'xp_award_duplicate_exists',
    'xp_award_regression_check',
    'xp_sync_snapshot'
  ]
  -- Trigger functions (triggers fire without EXECUTE rights).
  || ARRAY[
    'check_not_suspended',
    'credit_earnings_from_milestone',
    'enforce_free_habit_limit',
    'enforce_free_habit_update_lock',
    'enforce_google_play_revocation_status',
    'enforce_money_saver_challenge_goal_lock',
    'enforce_money_saver_entry_lock',
    'enforce_money_saver_goal_update_lock',
    'enforce_premium_challenge_write',
    'ensure_friend_code_after_profile_insert',
    'handle_new_user',
    'money_saver_recompute_goal',
    'protect_profile_fields',
    'rollup_security_alert',
    'sync_google_play_profile_entitlement',
    'trg_crown_award_bell',
    'trg_friend_accept_bell',
    'trg_habit_streak_milestone',
    'trg_habits_recalc_challenges',
    'trg_notification_log_to_bell',
    'trg_referral_reward_bell',
    'trg_subscription_active_bell'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;
