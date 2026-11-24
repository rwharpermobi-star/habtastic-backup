import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Banknote, CheckCircle2, Lock, ShieldCheck, Wallet, Clock, TrendingUp, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { untypedSupabase } from "@/integrations/supabase/untyped";

type MaskedBank = {
  account_holder_name: string;
  bank_name: string;
  account_number_masked: string;
  account_number_last4: string;
  account_type: "savings" | "cheque" | "business";
  branch_code: string;
  country: string;
  currency: string;
  updated_at: string;
};

type Summary = {
  available_cents: number;
  pending_cents: number;
  lifetime_cents: number;
  paid_cents: number;
  currency: string;
  min_payout_cents: number;
};

type PayoutRow = {
  id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed" | "rejected";
  created_at: string;
};

const fmt = (cents: number, cur = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: cur }).format((cents || 0) / 100);

export default function Banking() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [bank, setBank] = useState<MaskedBank | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Form state
  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "cheque" | "business">("savings");
  const [branchCode, setBranchCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [currency, setCurrency] = useState("ZAR");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Payout dialog
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [requesting, setRequesting] = useState(false);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: b }, { data: s }, { data: p }] = await Promise.all([
      untypedSupabase.rpc("get_my_bank_account_masked"),
      untypedSupabase.rpc("get_my_earnings_summary"),
      untypedSupabase
        .from("payout_requests")
        .select("id, amount_cents, currency, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setBank((b as MaskedBank) ?? null);
    setSummary((s as Summary) ?? null);
    setPayouts(((p as unknown) as PayoutRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const startEdit = () => {
    if (bank) {
      setHolder(bank.account_holder_name);
      setBankName(bank.bank_name);
      setAccountNumber("");
      setAccountType(bank.account_type);
      setBranchCode(bank.branch_code);
      setCountry(bank.country);
      setCurrency(bank.currency);
    }
    setPassword("");
    setEditing(true);
  };

  const save = async () => {
    if (!session?.access_token) return;
    if (!holder || !bankName || !accountNumber || !branchCode || !country || !currency) {
      toast.error("Please fill in all fields");
      return;
    }
    if (!/^\d{4,}$/.test(accountNumber.replace(/\D/g, ""))) {
      toast.error("Account number must be at least 4 digits");
      return;
    }
    if (!password) {
      toast.error("Enter your password to confirm");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("banking-save", {
        body: {
          password,
          holder,
          bank: bankName,
          account_number: accountNumber,
          account_type: accountType,
          branch_code: branchCode,
          country,
          currency,
        },
      });
      if (error || (data)?.error) {
        const code = String((data)?.error || "");
        const msg = code === "invalid_password"
          ? "Incorrect password"
          : "Could not save your banking details. Please try again.";
        toast.error(msg);
        return;
      }
      setEditing(false);
      setPassword("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
      await reload();
      toast.success("Banking details saved securely");
    } finally {
      setSaving(false);
    }
  };

  const requestPayout = async () => {
    if (!summary) return;
    const amt = Math.round(parseFloat(payoutAmount || "0") * 100);
    if (!amt || amt < summary.min_payout_cents) {
      toast.error(`Minimum payout is ${fmt(summary.min_payout_cents, summary.currency)}`);
      return;
    }
    if (amt > summary.available_cents) {
      toast.error("Amount exceeds available balance");
      return;
    }
    setRequesting(true);
    const { error } = await untypedSupabase.rpc("request_payout", { _amount_cents: amt });
    setRequesting(false);
    if (error) {
      console.error("[banking] payout request failed", error);
      toast.error("Could not submit the payout request. Please try again.");
      return;
    }
    setPayoutOpen(false);
    setPayoutAmount("");
    toast.success("Payout requested");
    reload();
  };

  const belowMin = useMemo(
    () => !summary || summary.available_cents < summary.min_payout_cents,
    [summary]
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Banking & Payouts</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Encrypted end-to-end
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Balance cards */}
        <div className="grid grid-cols-3 gap-2">
          <BalanceCard icon={Wallet} label="Available" value={summary ? fmt(summary.available_cents, summary.currency) : "—"} accent="text-primary" />
          <BalanceCard icon={Clock} label="Pending" value={summary ? fmt(summary.pending_cents, summary.currency) : "—"} />
          <BalanceCard icon={TrendingUp} label="Lifetime" value={summary ? fmt(summary.lifetime_cents, summary.currency) : "—"} />
        </div>

        {/* Request payout */}
        <Card className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Request a payout</p>
            <p className="text-xs text-muted-foreground">
              Min {summary ? fmt(summary.min_payout_cents, summary.currency) : "—"} · Paid to your bank
            </p>
          </div>
          <Button
            onClick={() => setPayoutOpen(true)}
            disabled={!bank || belowMin}
            className="gap-2"
          >
            <Send className="h-4 w-4" /> Request
          </Button>
        </Card>

        {/* Bank details card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Bank account</h2>
            </div>
            {bank && !editing && (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Lock className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!editing ? (
              <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : bank ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Field label="Account holder" value={bank.account_holder_name} />
                    <Field label="Bank" value={bank.bank_name} />
                    <Field label="Account number" value={bank.account_number_masked} mono />
                    <Field label="Type" value={cap(bank.account_type)} />
                    <Field label="Branch code" value={bank.branch_code} />
                    <Field label="Country" value={bank.country} />
                    <Field label="Currency" value={bank.currency} />
                  </dl>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-3">No bank account on file.</p>
                    <Button onClick={() => setEditing(true)}>Add banking details</Button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <FormRow label="Account holder name">
                  <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={100} />
                </FormRow>
                <FormRow label="Bank name">
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={80} />
                </FormRow>
                <FormRow label="Account number">
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder={bank ? "Enter new account number" : ""}
                    maxLength={20}
                  />
                </FormRow>
                <FormRow label="Account type">
                  <Select value={accountType} onValueChange={(v) => setAccountType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Branch code">
                    <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} maxLength={12} />
                  </FormRow>
                  <FormRow label="Currency">
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={4} />
                  </FormRow>
                </div>
                <FormRow label="Country">
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
                </FormRow>

                <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                  <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                    <Lock className="h-3 w-3" /> Confirm your password
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save securely"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Payout history */}
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Payout history</h2>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No payouts yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {payouts.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{fmt(p.amount_cents, p.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1 pt-2">
          <ShieldCheck className="h-3 w-3" /> Your details are encrypted and never displayed in full.
        </p>
      </main>

      {/* Success flash */}
      <AnimatePresence>
        {savedFlash && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 z-50"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Saved securely</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payout dialog */}
      <AlertDialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request payout</AlertDialogTitle>
            <AlertDialogDescription>
              Available: {summary ? fmt(summary.available_cents, summary.currency) : "—"}. Paid to {bank?.bank_name} ending {bank?.account_number_last4}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Amount ({summary?.currency ?? "ZAR"})</Label>
            <Input
              type="number"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={requesting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={requestPayout} disabled={requesting}>
              {requesting ? "Requesting…" : "Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BalanceCard({ icon: Icon, label, value, accent }: { icon; label: string; value: string; accent?: string }) {
  return (
    <motion.div whileTap={{ scale: 0.97 }} className="rounded-2xl border border-border/50 bg-card p-3">
      <Icon className={`h-4 w-4 mb-1.5 ${accent ?? "text-muted-foreground"}`} />
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
    </motion.div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: PayoutRow["status"] | null | undefined }) {
  const map: Record<PayoutRow["status"], string> = {
    pending: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    paid: "bg-green-500/15 text-green-600 dark:text-green-400",
    failed: "bg-red-500/15 text-red-600 dark:text-red-400",
    rejected: "bg-muted text-muted-foreground",
  };
  const safeStatus = status && status in map ? status : null;
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${safeStatus ? map[safeStatus] : "bg-muted text-muted-foreground"}`}>
      {safeStatus ? cap(safeStatus) : "Unknown"}
    </span>
  );
}

function cap(s: string | null | undefined) {
  const value = typeof s === "string" ? s.trim() : "";
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}
