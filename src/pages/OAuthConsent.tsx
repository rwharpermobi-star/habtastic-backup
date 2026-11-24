import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const BLOCKED_REDIRECT_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:"]);

function getSafeOAuthRedirect(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
  try {
    // OAuth clients may legitimately use an HTTPS URL, localhost HTTP URL, or
    // an app-specific custom scheme. Reject executable/local-file schemes and
    // embedded credentials while preserving registered native-app redirects.
    const url = new URL(value, window.location.origin);
    if (BLOCKED_REDIRECT_PROTOCOLS.has(url.protocol.toLowerCase())) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.assign("/?next=" + encodeURIComponent(next));
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        const target = getSafeOAuthRedirect(immediate);
        if (!target) return setError("The authorization server returned an unsafe redirect.");
        window.location.assign(target);
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = getSafeOAuthRedirect(data?.redirect_url ?? data?.redirect_to);
    if (!target) {
      setBusy(false);
      return setError("No safe redirect returned by the authorization server.");
    }
    window.location.assign(target);
  }

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-h2 font-semibold">Authorization error</h1>
          <p className="text-body text-muted-foreground">{error}</p>
        </div>
      </main>
    );

  if (!details)
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </main>
    );

  const clientName = details.client?.name ?? "an application";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full glass rounded-card p-6 shadow-card space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-h1 font-semibold">Connect {clientName} to HabTastic</h1>
          <p className="text-body text-muted-foreground">
            This will let {clientName} read your habits and mark them complete on your behalf.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => decide(false)}
            className="w-full"
          >
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
