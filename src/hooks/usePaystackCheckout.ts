import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logError } from "@/lib/logger";
import { shouldUsePlayBilling } from "@/lib/googlePlayBilling";
import { alreadySubscribedMessage, fetchBlockingSubscription } from "@/lib/subscriptionGuard";

export type PaystackPlan = "monthly" | "yearly";

const PAYSTACK_CHECKOUT_ORIGIN = "https://checkout.paystack.com";

function getSafePaystackCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== PAYSTACK_CHECKOUT_ORIGIN) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Starts a Paystack checkout. We call the `paystack-init` edge function
 * (which talks to Paystack with the secret key + creates/looks up a Plan
 * for recurring SKUs), then redirect the browser to Paystack's hosted checkout.
 *
 * Re-entrant calls (double-tap, double-submit) are silently dropped via an
 * `inFlight` ref so a user can never trigger two `paystack-init` calls — that
 * prevents accidental double-charges if a network blip delays the redirect.
 */
export function usePaystackCheckout() {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const startCheckout = async (plan: PaystackPlan) => {
    if (inFlight.current) return;
    // Google Play policy: the Android app must never open an external checkout.
    if (shouldUsePlayBilling()) {
      logError("payment", "Blocked website checkout inside Android app", undefined, { plan });
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const existing = auth?.user ? await fetchBlockingSubscription(auth.user.id).catch(() => null) : null;
      if (existing) {
        toast.info(alreadySubscribedMessage(existing.provider));
        return;
      }
      window.__lovableEvents?.track?.("project.subscription_checkout_started", { provider: "paystack", plan });
      const callbackUrl = `${window.location.origin}/checkout/success?plan=${plan}`;
      const { data, error } = await supabase.functions.invoke("paystack-init", {
        body: { plan, callbackUrl },
      });
      if (error || !data?.authorization_url) {
        const ctxStatus = (error)?.context?.status;
        if (ctxStatus === 409 || data?.code === "already_subscribed") {
          toast.info(alreadySubscribedMessage(data?.provider));
          return;
        }
        const msg = (error)?.message || data?.error || "Could not start checkout";
        logError("payment", "paystack-init failed", error, { plan, status: data?.status });
        toast.error(msg);
        return;
      }

      // Never navigate to an arbitrary server-returned URL. Paystack documents
      // authorization_url as an HTTPS URL on checkout.paystack.com.
      const checkoutUrl = getSafePaystackCheckoutUrl(data.authorization_url);
      if (!checkoutUrl) {
        logError("payment", "Rejected unexpected checkout URL", undefined, { plan });
        toast.error("Checkout could not be opened safely. Please try again.");
        return;
      }
      window.location.assign(checkoutUrl);
    } catch (e) {
      logError("payment", "paystack-init threw", e, { plan });
      toast.error("Could not start checkout. Please try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return { startCheckout, loading };
}
