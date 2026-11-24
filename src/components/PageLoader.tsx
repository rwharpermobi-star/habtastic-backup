import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Loading spinner with an escape hatch: if the chunk/page takes longer
 * than `timeoutMs` to resolve we surface a "Taking longer than usual"
 * message + reload button so the user is never trapped on an infinite spinner.
 */
export default function PageLoader({ timeoutMs = 12_000 }: { timeoutMs?: number }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);

  return (
    <div
      data-testid="auth-loader"
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
    >
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      {slow && (
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-muted-foreground">
            Taking longer than usual. Check your connection or reload.
          </p>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reload
          </Button>
        </div>
      )}
    </div>
  );
}
