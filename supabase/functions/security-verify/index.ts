// Post-deploy security verification harness.
//
// Admin-gated endpoint that re-asserts the server-authoritative economy
// contract end-to-end:
//   • Anon callers cannot trigger reward / score / referral RPCs
//   • Anon callers cannot write to economy ledgers (RLS)
//   • Anon callers cannot bump profiles.xp directly
//   • Service role baseline still works (background-job path) WITHOUT writing
//     any XP/coins — verification must never mutate the economy.
//
// Returns { ok, code, passed, failed, results } and:
//   401 missing/invalid auth, 403 non-admin,
//   422 contract_failed (structured, with failed check names),
//   500 only for genuinely unexpected internal errors.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

type Query = () => Promise<{ error: unknown; data?: unknown }>;

const msg = (e: unknown) =>
  String((e as { message?: string })?.message ?? e).slice(0, 300);

async function expectError(name: string, fn: Query): Promise<CheckResult> {
  try {
    const { error, data } = await fn();
    if (error) return { name, ok: true, detail: msg(error) };
    return { name, ok: false, detail: `expected error, got data=${JSON.stringify(data)?.slice(0, 200)}` };
  } catch (e) {
    return { name, ok: true, detail: `threw: ${msg(e)}` };
  }
}

async function expectOk(name: string, fn: Query): Promise<CheckResult> {
  try {
    const { error, data } = await fn();
    if (error) return { name, ok: false, detail: msg(error) };
    return { name, ok: true, detail: `data=${JSON.stringify(data)?.slice(0, 200)}` };
  } catch (e) {
    return { name, ok: false, detail: `threw: ${msg(e)}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const reqUrl = new URL(req.url);

    // Unauthenticated liveness probe used by CI ("is the function deployed?").
    const isHealthCheck =
      req.method === "GET" ||
      reqUrl.pathname.endsWith("/health") ||
      reqUrl.searchParams.get("health") === "1";

    if (isHealthCheck) {
      return json({ ok: true, code: "health_ok", function: "security-verify" }, 200);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return json({ ok: false, code: "misconfigured", error: "missing runtime env" }, 500);
    }

    // 1) Require an admin caller.
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token === anonKey || token.split(".").length !== 3) {
      return json({ ok: false, code: "missing_auth", error: "admin user JWT required" }, 401);
    }

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResp, error: userErr } = await service.auth.getUser(token);
    const uid = userResp?.user?.id;
    if (userErr || !uid) {
      return json(
        { ok: false, code: "unauthorized", error: "Unauthorized" },
        401,
      );
    }

    const { data: isAdmin, error: roleErr } = await service.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (roleErr) {
      console.error("[security-verify] role lookup failed", roleErr);
      return json({ ok: false, code: "role_lookup_failed", error: "Role verification failed" }, 500);
    }
    if (!isAdmin) {
      return json({ ok: false, code: "forbidden", error: "admin role required" }, 403);
    }

    // 2) Run the checks (all read-only or expected-to-fail — never mutating).
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const fakeUser = "11111111-1111-1111-1111-111111111111";

    const results: CheckResult[] = [];

    results.push(await expectError("anon award_xp rejected", () =>
      anon.rpc("award_xp" as never, {
        _user_id: fakeUser, _amount: 50, _reason: "habit_complete", _metadata: {},
      } as never)));
    results.push(await expectError("anon award_coins rejected", () =>
      anon.rpc("award_coins" as never, {
        _user_id: fakeUser, _amount: 10, _reason: "habit_complete", _metadata: {},
      } as never)));
    results.push(await expectError("anon submit_weekly_score rejected", () =>
      anon.rpc("submit_weekly_score" as never)));
    results.push(await expectError("anon create_referral_code rejected", () =>
      anon.rpc("create_referral_code" as never)));

    // Direct ledger writes
    results.push(await expectError("anon insert coin_transactions blocked", () =>
      anon.from("coin_transactions" as never).insert({
        user_id: fakeUser, delta: 999, balance_after: 999, reason: "hack",
      } as never)));
    results.push(await expectError("anon insert xp_transactions blocked", () =>
      anon.from("xp_transactions" as never).insert({
        user_id: fakeUser, delta: 999, balance_after: 999, reason: "hack",
      } as never)));
    results.push(await expectError("anon insert premium_grants blocked", () =>
      anon.from("premium_grants" as never).insert({
        user_id: fakeUser, kind: "yearly", premium_until: "2099-12-31T00:00:00Z",
      } as never)));
    results.push(await expectError("anon insert referrals blocked", () =>
      anon.from("referrals").insert({
        referrer_id: fakeUser, referral_code: "HACK01",
      } as never)));
    results.push(await expectError("anon upsert weekly_scores blocked", () =>
      anon.from("weekly_scores" as never).upsert({
        user_id: fakeUser, week_start: "2026-01-05", display_name: "h",
        growth_score: 100, grade: "S", habits_completed: 1, total_habits: 1,
        best_streak: 1, perfect_days: 1,
      } as never)));

    // profiles.xp direct write
    const anonProfile = await anon
      .from("profiles")
      .update({ xp: 999999 } as never)
      .eq("user_id", fakeUser)
      .select();
    results.push({
      name: "anon profiles.xp update stripped or denied",
      ok: Boolean(anonProfile.error) ||
        (Array.isArray(anonProfile.data) && anonProfile.data.length === 0),
      detail: anonProfile.error ? msg(anonProfile.error) : `rows=${anonProfile.data?.length ?? 0}`,
    });

    // Service-role baseline: prove the background-job path can reach the
    // SECURITY DEFINER economy RPC without auth.uid() — with _amount = 0 the
    // function short-circuits before any ledger/profile write, so this is
    // idempotent and cannot create duplicate rewards.
    results.push(await expectOk("service_role award_xp reachable (no-op, _amount=0)", () =>
      service.rpc("award_xp" as never, {
        _user_id: uid, _amount: 0, _reason: "habit_complete",
        _metadata: { __verify__: true },
      } as never)));
    // Service role must also bypass RLS on the ledger for reads.
    results.push(await expectOk("service_role can read xp_transactions", () =>
      service.from("xp_transactions" as never).select("id").limit(1)));

    const passed = results.filter((r) => r.ok).length;
    const failedChecks = results.filter((r) => !r.ok).map((r) => r.name);
    const failed = failedChecks.length;

    return json(
      {
        ok: failed === 0,
        code: failed === 0 ? "contract_ok" : "contract_failed",
        passed,
        failed,
        total: results.length,
        failedChecks,
        results,
      },
      failed === 0 ? 200 : 422,
    );
  } catch (e) {
    console.error("[security-verify] internal error", e);
    return json({ ok: false, code: "internal_error", error: "Security verification failed" }, 500);
  }
});
