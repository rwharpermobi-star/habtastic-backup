import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError("render", "React render error", error, {
      componentStack: info.componentStack?.split("\n").slice(0, 6).join("\n"),
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
    try {
      toast.error("Something went wrong", {
        description: error.message?.slice(0, 140) || "An unexpected error occurred.",
      });
    } catch {
      /* toast may not be mounted */
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const message = this.state.error?.message || "An unexpected error occurred.";

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md text-center space-y-5 bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Oops — something broke
            </h2>
            <p className="text-sm text-muted-foreground">
              Winston hit a snag rendering this screen. Try again, or head home.
            </p>
          </div>
          <pre className="text-xs text-left bg-muted/50 text-muted-foreground rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap break-words">
            {message}
          </pre>
          <div className="flex flex-col gap-2">
            <Button onClick={this.handleReset} className="w-full" variant="default">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={this.handleReload} variant="outline">
                Reload app
              </Button>
              <Button onClick={this.handleHome} variant="outline">
                <Home className="w-4 h-4 mr-2" />
                Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
