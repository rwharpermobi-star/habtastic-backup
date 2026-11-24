import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Sparkles, Target, MessageCircle, Trophy, ArrowRight, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useConfetti } from "@/hooks/useConfetti";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/hooks/usePremium";
import { ADMIN_EMAIL } from '@/lib/contactEmails';
import { clearVerificationRecord, saveVerificationRecord } from "@/lib/purchaseVerification";

type PlanKey = "monthly" | "yearly";

const PLAN_DETAILS: Record<PlanKey, { label: string; price: string; cadence: string; tagline: string }> = {
  monthly:  { label: "Premium Monthly", price: "R94.99",  cadence: "month", tagline: "Premium is active." },
  yearly:   { label: "Premium Yearly",  price: "R899.99", cadence: "year",  tagline: "Premium is active for the next year." },
};

const NEXT_STEPS = [
  { icon: Target,        title: "Unlimited Winston AI",         description: "No more 20-message daily cap — coach as often as you want.", cta: "Open Coach",  to: "/coach" },
  { icon: MessageCircle, title: "Chat with Winston anytime",    description: "Unlimited AI coaching, voice replies, and personalised nudges.", cta: "Open Coach",  to: "/coach"  },
  { icon: Trophy,        title: "Manage your Premium benefits", description: "Review your Premium status, account settings, themes, and available rewards.", cta: "Open Profile", to: "/profile" },
];

const PREMIUM_POLL_MAX = 8;
const PREMIUM_POLL_INTERVAL_MS = 2000;
const VERIFY_MAX_ATTEMPTS = 2;
const VERIFY_TIMEOUT_MS = 20_000;

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { fireConfetti } = useConfetti();
  const { user, checkSubscription } = useAuth();
  const userId = user?.id;
  const { isPremium, nextBillingDate } = usePremium();

  const planParam = (params.get("plan") || "").toLowerCase() as PlanKey;
  const plan: PlanKey = (["monthly", "yearly"] as PlanKey[]).includes(planParam) ? planParam : "monthly";
  const details = PLAN_DETAILS[plan];
  const reference = params.get("reference") || params.get("trxref");
  const externalStatus = (params.get("status") || "").toLowerCase();

  const [state, setState] = useState<"verifying" | "success" | "failed">("verifying");
  const [attempt, setAttempt] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [failReason, setFailReason] = useState<string>("");
  const [syncTries, setSyncTries] = useState(0);
  const [syncSecondsLeft, setSyncSecondsLeft] = useState(0);

  useEffect(() => {
    if (externalStatus === "cancelled" || externalStatus === "canceled") {
      navigate(`/checkout/cancel?${params.toString()}`, { replace: true });
    } else if (externalStatus === "failed" || externalStatus === "abandoned") {
      navigate(`/checkout/failed?${params.toString()}`, { replace: true });
    }
  }, [externalStatus, navigate, params]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    (async () => {
      if (!reference) {
        window.__lovableEvents?.track?.("project.subscription_verification_failed", {
          provider: "paystack",
          plan,
          reason: "missing_reference",
        });
        if (userId) saveVerificationRecord(userId, { provider: "paystack", plan, code: "missing_reference" });
        setState("failed");
        setFailReason(`Missing payment reference. If you were charged, contact ${ADMIN_EMAIL}.`);
        try { (await import("@/lib/logger")).logError("payment", "checkout success without reference"); } catch { /* noop */ }
        return;
      }
      setState("verifying");
      try {
        const { data, error } = await supabase.functions.invoke("paystack-verify", {
          body: { reference },
          timeout: VERIFY_TIMEOUT_MS,
        });
        if (cancelled) return;
        if (error || data?.status !== "success") {
          const reason = data?.status && data.status !== "success"
            ? `Payment status: ${String(data.status)}`
            : "Payment verification is temporarily unavailable.";
          try { (await import("@/lib/logger")).logError("payment", "paystack-verify failed", error, { reference, status: data?.status, attempt }); } catch { /* noop */ }
          if (attempt < VERIFY_MAX_ATTEMPTS - 1) {
            const delay = 1500 * Math.pow(2, attempt);
            retryTimer = window.setTimeout(() => { if (!cancelled) setAttempt((a) => a + 1); }, delay);
            return;
          }
          const failCode = data?.status && data.status !== "success" ? "payment_not_successful" : "verification_unavailable";
          window.__lovableEvents?.track?.("project.subscription_verification_failed", {
            provider: "paystack",
            plan,
            reason: failCode,
          });
          if (userId) saveVerificationRecord(userId, { provider: "paystack", plan, code: failCode });
          setFailReason(String(reason));
          setState("failed");
          return;
        }
        // Count each Paystack reference once, even if this page is reloaded.
        const trackedKey = `habtastic.purchaseTracked.${reference}`;
        let alreadyTracked = false;
        try { alreadyTracked = sessionStorage.getItem(trackedKey) === "1"; } catch { /* noop */ }
        if (!alreadyTracked) {
          window.__lovableEvents?.track?.("project.subscription_purchased", { provider: "paystack", plan });
          try { sessionStorage.setItem(trackedKey, "1"); } catch { /* noop */ }
        }
        if (userId) clearVerificationRecord(userId);
        await checkSubscription();
        if (cancelled) return;
        setState("success");
        fireConfetti();
      } catch (e) {
        if (cancelled) return;
        try { (await import("@/lib/logger")).logError("payment", "paystack-verify threw", e, { reference, attempt }); } catch { /* noop */ }
        if (attempt < VERIFY_MAX_ATTEMPTS - 1) {
          const delay = 1500 * Math.pow(2, attempt);
          retryTimer = window.setTimeout(() => { if (!cancelled) setAttempt((a) => a + 1); }, delay);
          return;
        }
        window.__lovableEvents?.track?.("project.subscription_verification_failed", {
          provider: "paystack",
          plan,
          reason: "network_error",
        });
        if (userId) saveVerificationRecord(userId, { provider: "paystack", plan, code: "network_error" });
        setFailReason(e instanceof Error ? e.message : "Network error");
        setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [reference, plan, userId, checkSubscription, fireConfetti, attempt]);

  useEffect(() => {
    if (state !== "success" || isPremium) return;
    let cancelled = false;
    let tries = 0;
    let scheduledTick: number | undefined;
    const totalMs = PREMIUM_POLL_MAX * PREMIUM_POLL_INTERVAL_MS;
    const startedAt = Date.now();

    setSyncSecondsLeft(Math.ceil(totalMs / 1000));
    const countdown = window.setInterval(() => {
      if (cancelled) return;
      const remaining = Math.max(0, totalMs - (Date.now() - startedAt));
      setSyncSecondsLeft(Math.ceil(remaining / 1000));
    }, 1000);

    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      setSyncTries(tries);
      try {
        if (tries === 3 || tries === 6) {
          setSyncing(true);
          try {
            await supabase.functions.invoke("paystack-sync-subscription", { body: {} });
          } catch (err) {
            try {
              (await import("@/lib/logger")).logError(
                "payment",
                "paystack-sync-subscription failed",
                err,
                { reference, tries },
              );
            } catch { /* noop */ }
          }
        }
        await checkSubscription();
      } finally {
        if (!cancelled) setSyncing(false);
      }
      if (!cancelled && tries < PREMIUM_POLL_MAX) {
        scheduledTick = window.setTimeout(tick, PREMIUM_POLL_INTERVAL_MS);
      }
    };
    scheduledTick = window.setTimeout(tick, PREMIUM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (scheduledTick !== undefined) window.clearTimeout(scheduledTick);
      window.clearInterval(countdown);
    };
  }, [state, isPremium, checkSubscription, reference]);

  if (state === "failed") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
          <XCircle className="mx-auto h-14 w-14 text-destructive" />
          <h1 className="mt-4 text-2xl font-bold">Payment didn't go through</h1>
          <p className="mt-2 text-muted-foreground">
            {failReason || "We couldn't verify your transaction."} If you were charged, email
            {" "}<a className="underline" href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a> and we'll sort it out.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => { setAttempt(0); setFailReason(""); setState("verifying"); }}>
              Retry verification
            </Button>
            <Button variant="outline" onClick={() => navigate("/settings/subscription")}>Check status & restore help</Button>
            <Button variant="outline" onClick={() => navigate("/pricing")}>Choose a plan again</Button>
            <Button variant="ghost" onClick={() => navigate("/")}>Back to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-10 pb-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20">
            {state === "verifying"
              ? <Loader2 className="h-10 w-10 animate-spin text-primary" />
              : <CheckCircle2 className="h-12 w-12 text-primary" strokeWidth={2.5} />}
          </div>
          <Badge variant="secondary" className="mb-3">
            <Sparkles className="mr-1 h-3 w-3" /> Premium activated
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            {state === "verifying" ? "Confirming your payment…" : "You're in! 🎉"}
          </h1>
          <p className="mt-2 text-muted-foreground">{details.tagline}</p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Your plan</p>
                <p className="mt-1 text-xl font-semibold">{details.label}</p>
                <p className="text-sm text-muted-foreground">
                  {details.price} <span className="opacity-70">/ {details.cadence}</span>
                </p>
              </div>
              <Badge className="shrink-0">Auto-renews</Badge>
            </div>
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
              {state === "verifying" ? (
                <div className="space-y-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying with Paystack
                    {attempt > 0 && (
                      <span className="text-xs">
                        · attempt {attempt + 1} of {VERIFY_MAX_ATTEMPTS}
                      </span>
                    )}
                  </span>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${((attempt + 1) / VERIFY_MAX_ATTEMPTS) * 100}%` }}
                    />
                  </div>
                </div>
              ) : state === "success" && !isPremium ? (
                <div className="space-y-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {syncing ? "Re-syncing with Paystack…" : "Activating premium…"}
                  </span>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Attempt {Math.max(1, syncTries)} of {PREMIUM_POLL_MAX}</span>
                    <span>
                      {syncSecondsLeft > 0
                        ? `~${syncSecondsLeft}s left`
                        : "Almost there…"}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${(syncTries / PREMIUM_POLL_MAX) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className={isPremium ? "text-foreground" : "text-muted-foreground"}>
                  {nextBillingDate
                    ? `Next billing date: ${nextBillingDate.toLocaleDateString()}`
                    : "Premium activated."}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Your next steps</h2>
          <div className="space-y-3">
            {NEXT_STEPS.map(({ icon: Icon, title, description, cta, to }) => (
              <Card key={to}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{title}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link to={to} aria-label={cta}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => navigate("/")}>Go to Dashboard</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/profile")}>Manage subscription</Button>
        </div>
      </div>
    </div>
  );
}
