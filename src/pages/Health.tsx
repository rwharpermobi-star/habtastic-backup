import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/contactEmails";

type Status = "pending" | "ok" | "fail";

interface Check {
  id: "frontend" | "backend";
  label: string;
  description: string;
  status: Status;
}

const newChecks = (): Check[] => [
  {
    id: "frontend",
    label: "Web application",
    description: "HabTastic loaded successfully",
    status: "pending",
  },
  {
    id: "backend",
    label: "Account service",
    description: "Authentication service is reachable",
    status: "pending",
  },
];

const statusIcon = (status: Status) => {
  if (status === "pending") {
    return <Loader2 aria-label="Checking" className="w-5 h-5 animate-spin text-muted-foreground" />;
  }
  if (status === "ok") {
    return <CheckCircle2 aria-label="Operational" className="w-5 h-5 text-green-500" />;
  }
  return <XCircle aria-label="Unavailable" className="w-5 h-5 text-destructive" />;
};

export default function Health() {
  const [checks, setChecks] = useState<Check[]>(newChecks);
  const [running, setRunning] = useState(false);

  const update = useCallback((id: Check["id"], status: Status) => {
    setChecks((current) => current.map((check) => (
      check.id === id ? { ...check, status } : check
    )));
  }, []);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setChecks(newChecks());
    update("frontend", "ok");

    const backendUrl = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!backendUrl || !publishableKey) {
      update("backend", "fail");
      setRunning(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${backendUrl}/auth/v1/health`, {
        headers: { apikey: publishableKey },
        signal: controller.signal,
      });
      update("backend", response.ok ? "ok" : "fail");
    } catch {
      update("backend", "fail");
    } finally {
      window.clearTimeout(timeout);
      setRunning(false);
    }
  }, [update]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const failed = checks.some((check) => check.status === "fail");
  const allOk = !running && !failed && checks.every((check) => check.status === "ok");

  return (
    <main className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="w-4 h-4 mr-1" /> Home
          </Link>
          <Button size="sm" variant="outline" onClick={runChecks} disabled={running}>
            <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-2 ${running ? "animate-spin" : ""}`} />
            Re-run
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">System status</h1>
          <p className="text-sm text-muted-foreground">
            Checks whether HabTastic and its account service are available.
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl p-4 border ${
            running
              ? "bg-muted/40 border-border"
              : allOk
                ? "bg-green-500/10 border-green-500/30"
                : "bg-destructive/10 border-destructive/30"
          }`}
        >
          <div className="font-medium text-foreground">
            {running ? "Running checks…" : allOk ? "All systems operational" : "A service is unavailable"}
          </div>
          {!running && failed && (
            <p className="text-sm text-muted-foreground mt-1">
              Please try again shortly. No account data was changed by this check.
            </p>
          )}
        </div>

        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
              <div className="mt-0.5">{statusIcon(check.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{check.label}</div>
                <div className="text-xs text-muted-foreground">{check.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2">
          Need help? Email {SUPPORT_EMAIL}
        </div>
      </div>
    </main>
  );
}
