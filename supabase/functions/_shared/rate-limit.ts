import { createClient } from "npm:@supabase/supabase-js@2";

// Shared rate-limit helpers for edge functions.
// - enforceRateLimit: per-user (auth.uid) via rate_limit_check
// - enforceIpRateLimit: per-IP via rate_limit_check_ip (uses service-role client)

export interface RateLimitRule {
  action: string;
  windowSeconds: number;
  max: number;
}

/**
 * Enforces one or more per-user rate-limit rules. Returns a Response (HTTP 429)
 * when any rule is exceeded; returns null when all rules pass or transient RPC
 * errors occur (errors are logged but never block the request).
 */
export async function enforceRateLimit(
  supabaseAuth: any,
  rules: RateLimitRule[],
  ctx: { name: string; userId?: string; corsHeaders: Record<string, string> },
): Promise<Response | null> {
  // Signed-in users cannot run the counter themselves; when the caller has
  // already verified the user, count with a server-only client instead.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const admin = ctx.userId && serviceKey && supabaseUrl
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  try {
    for (const rule of rules) {
      const { error } = admin
        ? await admin.rpc("rate_limit_check_user", {
          _user_id: ctx.userId,
          _action: rule.action,
          _window_seconds: rule.windowSeconds,
          _max: rule.max,
        })
        : await supabaseAuth.rpc("rate_limit_check", {
          _action: rule.action,
          _window_seconds: rule.windowSeconds,
          _max: rule.max,
        });
      if (error) {
        if ((error.message ?? "").includes("rate_limited")) {
          console.warn(`[${ctx.name}] rate-limited`, {
            user: ctx.userId,
            action: rule.action,
          });
          return new Response(
            JSON.stringify({ error: "Too many requests", action: rule.action }),
            {
              status: 429,
              headers: {
                ...ctx.corsHeaders,
                "Content-Type": "application/json",
                "Retry-After": String(Math.min(rule.windowSeconds, 3600)),
              },
            },
          );
        }
        console.error(`[${ctx.name}] rate_limit_check rpc error`, error);
      }
    }
  } catch (e) {
    console.error(`[${ctx.name}] rate_limit_check threw`, e);
  }
  return null;
}

/**
 * Extracts a best-effort client IP from common proxy headers. Falls back to
 * "unknown" — the DB helper will bucket those together, which is fine as a
 * conservative default (they all share one budget).
 */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("fly-client-ip") ||
    "unknown"
  );
}

/**
 * Enforces per-IP rate-limit rules using a service-role Supabase client.
 * Safe for unauthenticated endpoints (webhooks, public functions).
 */
export async function enforceIpRateLimit(
  supabaseAdmin: any,
  req: Request,
  rules: RateLimitRule[],
  ctx: { name: string; corsHeaders: Record<string, string> },
): Promise<Response | null> {
  const ip = getClientIp(req);
  try {
    for (const rule of rules) {
      const { data, error } = await supabaseAdmin.rpc("rate_limit_check_ip", {
        _ip: ip,
        _endpoint: rule.action,
        _max_requests: rule.max,
        _window_seconds: rule.windowSeconds,
      });
      if (error) {
        console.error(`[${ctx.name}] rate_limit_check_ip rpc error`, error);
        continue;
      }
      if (data === false) {
        console.warn(`[${ctx.name}] ip-rate-limited`, { ip, action: rule.action });
        return new Response(
          JSON.stringify({ error: "Too many requests", action: rule.action }),
          {
            status: 429,
            headers: {
              ...ctx.corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(Math.min(rule.windowSeconds, 3600)),
            },
          },
        );
      }
    }

  } catch (e) {
    console.error(`[${ctx.name}] rate_limit_check_ip threw`, e);
  }
  return null;
}
