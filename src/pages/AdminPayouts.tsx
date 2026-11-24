import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { untypedSupabase } from "@/integrations/supabase/untyped";

type Row = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  bank_snapshot;
};

const fmt = (c: number, cur: string) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: cur }).format((c || 0) / 100);

export default function AdminPayouts() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await untypedSupabase
      .from("payout_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(((data as unknown) as Row[]) ?? []);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const act = async (id: string, action: "approve" | "reject" | "mark_paid" | "mark_failed") => {
    setBusy(id);
    const note = action === "reject" || action === "mark_failed" ? prompt("Note (optional)") ?? undefined : undefined;
    const { error } = await untypedSupabase.rpc("admin_process_payout", { _payout_id: id, _action: action, _note: note ?? null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    load();
  };

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return (
    <div className="p-6 text-center">
      <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <p className="text-sm">Admin access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Payout requests</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No payout requests.</p>}
        {rows.map((r) => (
          <Card key={r.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{fmt(r.amount_cents, r.currency)}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{r.status}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {r.bank_snapshot?.account_holder_name} · {r.bank_snapshot?.bank_name} · ••••{r.bank_snapshot?.last4} · {r.bank_snapshot?.country}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/70 break-all">user: {r.user_id}</div>
            {r.admin_note && <div className="text-xs italic">Note: {r.admin_note}</div>}
            <div className="flex flex-wrap gap-2 pt-1">
              {r.status === "pending" && (
                <>
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "reject")}>Reject</Button>
                </>
              )}
              {r.status === "processing" && (
                <>
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, "mark_paid")}>Mark paid</Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "mark_failed")}>Mark failed</Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}
