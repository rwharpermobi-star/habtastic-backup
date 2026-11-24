// Returns the resolved Paystack runtime configuration + the LIVE pricing
// catalog fetched directly from Paystack (`/plan` list). This lets the
// client Premium page render prices that match what will actually be
// charged. Falls back to the local PLANS catalog if Paystack is unreachable.
import { corsHeaders, CURRENCY, WEBHOOK_URL, PLANS, getEnvironment, isConfiguredPaystackPlan, listPaystackPlans } from "../_shared/paystack.ts";

type UiPlan = {
  name: string;
  interval: string;
  amount_minor: number;    // kobo/cents
  amount: number;          // major units
  currency: string;
  one_time: boolean;
  plan_code?: string;
  source: "paystack" | "fallback";
};

function toUi(name: string, interval: string, amountMinor: number, currency: string, oneTime: boolean, source: UiPlan["source"], planCode?: string): UiPlan {
  return {
    name,
    interval,
    amount_minor: amountMinor,
    amount: amountMinor / 100,
    currency,
    one_time: oneTime,
    plan_code: planCode,
    source,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const currencyEnvProvided = !!Deno.env.get("PAYSTACK_CURRENCY");

  // Build fallback (from shared PLANS catalog) up front so we never blank out.
  const fallback: Record<string, UiPlan> = Object.fromEntries(
    Object.entries(PLANS).map(([k, p]) => [
      k,
      toUi(p.name, p.interval, p.amount, p.currency, p.oneTime, "fallback"),
    ]),
  );

  // Try to overlay LIVE prices from Paystack `/plan` list.
  let plans = fallback;
  try {
    const items = await listPaystackPlans();
    const next: Record<string, UiPlan> = { ...fallback };
    for (const [key, cfg] of Object.entries(PLANS)) {
      // Only use the exact configured Paystack plan. Do not fall back to
      // same-interval plans because older yearly plans can share interval/currency.
      const match = items.find((p) => isConfiguredPaystackPlan(p, key as keyof typeof PLANS));
      if (match && typeof match.amount === "number") {
        next[key] = toUi(
          match.name ?? cfg.name,
          match.interval ?? cfg.interval,
          match.amount,
          (match.currency ?? cfg.currency).toUpperCase(),
          cfg.oneTime,
          "paystack",
          match.plan_code,
        );
      }
    }
    plans = next;
  } catch (e) {
    console.warn("paystack-config: could not fetch live plans, using fallback:", e);
  }

  return new Response(
    JSON.stringify({
      currency: CURRENCY,
      currency_env_provided: currencyEnvProvided,
      currency_default_active: !currencyEnvProvided && CURRENCY === "USD",
      webhook_url: WEBHOOK_URL,
      webhook_url_env_provided: !!Deno.env.get("PAYSTACK_WEBHOOK_URL"),
      environment: getEnvironment(),
      plans,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" } },
  );
});
