import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { XCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logInfo } from "@/lib/logger";

/**
 * Dedicated page for when a user backs out of the Paystack hosted checkout.
 * The former Shop checkout surface has been removed, so every retry returns
 * to the Premium pricing page instead of a dead /shop route.
 */
export default function CheckoutCancelled() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get("reference") || params.get("trxref") || undefined;
  const surface = params.get("surface") === "shop" ? "shop" : "premium";
  const planParam = params.get("plan");
  const plan = planParam === "monthly" || planParam === "yearly" ? planParam : "unknown";

  useEffect(() => {
    logInfo("payment", "checkout cancelled by user", { reference, surface });
    if (surface === "premium") {
      window.__lovableEvents?.track?.("project.subscription_checkout_cancelled", { provider: "paystack", plan });
    }
  }, [reference, surface, plan]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Checkout cancelled</h1>
        <p className="text-sm text-muted-foreground">
          You cancelled before completing payment. No money has changed hands.
          {reference ? <span className="block mt-2 text-xs opacity-70">Ref: {reference}</span> : null}
        </p>
        <div className="flex gap-2 justify-center flex-wrap pt-2">
          <Button onClick={() => navigate("/pricing")}>
            <RotateCcw className="h-4 w-4 mr-2" /> Try again
          </Button>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
