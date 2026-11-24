import { Component, ErrorInfo, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/logger";

interface Props {
  /** Resets the boundary whenever this key changes (e.g. route pathname). */
  resetKey: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetKey: string;
}

/**
 * Per-route error boundary. Unlike the global ErrorBoundary, this one
 * automatically resets when the route changes, so a render error on one
 * screen never permanently locks the app shell — the user can navigate
 * away (via bottom nav) and the next screen mounts clean.
 */
class RouteErrorBoundaryInner extends Component<Props & { onHome: () => void }, State> {
  state: State = { hasError: false, error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError("render", "Route render error", error, {
      componentStack: info.componentStack?.split("\n").slice(0, 6).join("\n"),
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = this.state.error?.message || "An unexpected error occurred.";
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-4 bg-card border border-border rounded-2xl p-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">This screen hit a snag</h2>
            <p className="text-sm text-muted-foreground">You can retry or head back home — the rest of the app still works.</p>
          </div>
          <pre className="text-xs text-left bg-muted/50 text-muted-foreground rounded-lg p-3 max-h-28 overflow-auto whitespace-pre-wrap break-words">{message}</pre>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={this.handleReset} variant="default">
              <RefreshCw className="w-4 h-4 mr-2" /> Try again
            </Button>
            <Button onClick={this.props.onHome} variant="outline">
              <Home className="w-4 h-4 mr-2" /> Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <RouteErrorBoundaryInner resetKey={location.pathname} onHome={() => navigate("/")}>
      {children}
    </RouteErrorBoundaryInner>
  );
}
