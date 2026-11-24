import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, RotateCcw, LifeBuoy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/logger";
import { ADMIN_EMAIL } from '@/lib/contactEmails';

/**
 * Dedicated failure page for Paystack flows. The former Shop checkout surface
 * has been removed, so retry always returns to the Premium pricing page.
 */
export default function CheckoutFailed() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get("reference") || params.get("trxref") || undefined;
  const reason = params.get("reason") || "We couldn't complete your payment.";
  const surface = params.get("surface") === "shop" ? "shop" : "premium";

  useEffect(() => {
    logError("payment", "checkout failed page shown", reason, { reference, surface });
  }, [reference, reason, surface]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
        <h1 className="text-2xl font-bold">Payment failed</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
        {reference ? (
          <p className="text-xs text-muted-foreground opacity-70">Reference: {reference}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          If your card was charged, email{" "}
          <a className="underline" href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a>{" "}
          with the reference above and we'll resolve it within 24 hours.
        </p>
        <div className="flex gap-2 justify-center flex-wrap pt-2">
          <Button onClick={() => navigate("/pricing")}>
            <RotateCcw className="h-4 w-4 mr-2" /> Try a different payment
          </Button>
          <Button variant="outline" asChild>
            <a href={`mailto:${ADMIN_EMAIL}`}>
              <LifeBuoy className="h-4 w-4 mr-2" /> Contact support
            </a>
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Home
          </Button>
        </div>
      </div>
    </div>
  );
}
