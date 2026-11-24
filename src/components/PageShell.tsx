import { ReactNode } from "react";
import { Loader2, AlertTriangle, Inbox, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { logError } from "@/lib/logger";

interface PageShellProps {
  loading?: boolean;
  /** Truthy value renders the error UI. Pass an Error, string, or any object. */
  error?: unknown;
  /** When true (and not loading/error) the empty state is rendered. */
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  loadingLabel?: string;
  onRetry?: () => void;
  /** Category used when logging errors. */
  logCategory?: "render" | "supabase" | "edge_function" | "network" | "app";
  className?: string;
  children?: ReactNode;
}

/**
 * Shared wrapper that guarantees every route renders one of:
 *  - loading state (spinner)
 *  - error state (with retry + back-home)
 *  - empty state (caller-supplied copy + optional CTA)
 *  - children (the happy path)
 *
 * This eliminates blank screens caused by an in-flight query, an unhandled
 * thrown error in a hook, or a successful response with zero rows.
 */
export default function PageShell({
  loading,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyMessage = "Once there's data to show, it'll appear here.",
  emptyAction,
  loadingLabel = "Loading…",
  onRetry,
  logCategory = "render",
  className,
  children,
}: PageShellProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={"min-h-[60vh] flex flex-col items-center justify-center gap-3 " + (className ?? "")}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground" aria-live="polite">{loadingLabel}</p>
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong";
    // Log once per render of the error state — gives ops a breadcrumb when a screen recovers via retry.
    try { logError(logCategory, "PageShell error state", error, { route: typeof window !== "undefined" ? window.location.pathname : "" }); } catch { /* noop */ }
    return (
      <div className={"min-h-[60vh] flex items-center justify-center px-6 " + (className ?? "")}>
        <div className="max-w-md w-full text-center space-y-4">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="text-xl font-semibold">We hit a snag</h2>
          <p className="text-sm text-muted-foreground break-words">{message}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {onRetry && (
              <Button onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-2" /> Try again
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/")}>
              <Home className="h-4 w-4 mr-2" /> Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={"min-h-[50vh] flex items-center justify-center px-6 " + (className ?? "")}>
        <div className="max-w-md w-full text-center space-y-3">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">{emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          {emptyAction}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
