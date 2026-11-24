import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { shouldUsePlayBilling, openPlaySubscriptionManagement } from "@/lib/googlePlayBilling";
import { playManageUrl } from "@/lib/subscriptionGuard";

/**
 * Shown when the user's latest subscription is in `attention` (renewal payment
 * failed). The fix is offered only where the subscription was bought: Google
 * Play subscriptions go to Play; website subscriptions are never pushed to a
 * website checkout from inside the Android app.
 */
export function PaymentDunningBanner() {
  const { user } = useAuth();
  const [pastDue, setPastDue] = useState<{ provider: string | null; plan_code: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, provider, plan_code")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setPastDue(data?.status === "attention" ? { provider: data.provider, plan_code: data.plan_code } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!pastDue) return null;
  const isPlaySub = pastDue.provider === "google_play";
  const onAndroid = shouldUsePlayBilling();
  if (onAndroid && !isPlaySub) return null;

  const handleUpdate = async () => {
    if (isPlaySub) {
      if (onAndroid) await openPlaySubscriptionManagement().catch(() => undefined);
      else window.open(playManageUrl(pastDue.plan_code), "_blank", "noopener,noreferrer");
      return;
    }
    // Paystack has no hosted "update card" portal; a fresh checkout authorises a new card.
    window.location.href = "/pricing";
  };

  return (
    <div className="w-full bg-warning/15 border-b border-warning/40 px-4 py-2.5 text-center text-sm text-foreground flex items-center justify-center gap-2 flex-wrap">
      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
      <span>
        {isPlaySub
          ? "Your last renewal payment failed. Fix your payment method in Google Play to keep Premium."
          : "Your last renewal payment failed. Update your card to keep Premium active."}
      </span>
      <button onClick={handleUpdate} className="underline font-semibold">
        {isPlaySub ? "Open Google Play" : "Update payment method"}
      </button>
    </div>
  );
}
