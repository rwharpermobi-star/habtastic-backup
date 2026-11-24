import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { logWarn } from "@/lib/logger";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    logWarn("navigation", "404 route", { path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center animate-fade-in-up max-w-md">
        <p className="text-6xl mb-4">🔍</p>
        <h1 className="text-h1 text-foreground mb-2">Page not found</h1>
        <p className="text-body text-muted-foreground mb-2">
          We couldn't find that page.
        </p>
        <p className="text-xs text-muted-foreground/70 mb-6 font-mono break-all">
          {location.pathname}
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => navigate('/')} className="gradient-primary text-primary-foreground rounded-btn h-12 px-6 font-semibold gap-2">
            <Home className="w-4 h-4" /> Go Home
          </Button>
          <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Go back
          </Button>
        </div>
      </div>
    </div>
  );
}
