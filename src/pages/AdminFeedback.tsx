import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Inbox, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FeedbackRow = {
  id: string;
  user_id: string;
  category: string | null;
  message: string | null;
  created_at: string;
};

export default function AdminFeedback() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("feedback")
      .select("id, user_id, category, message, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      console.error("Admin feedback inbox failed to load", error);
      return;
    }
    setRows((data as FeedbackRow[]) ?? []);
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const categories = ["All", ...Array.from(new Set(rows.map((row) => row.category || "General"))).sort()];
  const filtered = rows.filter((row) => {
    const matchesCategory = category === "All" || (row.category || "General") === category;
    const text = `${row.category || ""} ${row.message || ""} ${row.user_id}`.toLowerCase();
    return matchesCategory && text.includes(query.trim().toLowerCase());
  });

  if (adminLoading) return <div className="p-6 text-center text-sm text-muted-foreground">Checking admin access…</div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-background p-6 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-semibold">Admin access required.</p>
      <Button className="mt-4" variant="outline" onClick={() => navigate(-1)}>Go back</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-5">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Feedback inbox</h1>
              <p className="text-sm text-muted-foreground">Private admin view of tester and user feedback</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total submissions</p><p className="text-2xl font-semibold">{rows.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Showing</p><p className="text-2xl font-semibold">{filtered.length}</p></CardContent></Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages, category, or user ID" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {loading && rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Loading feedback…</p> : null}
        {!loading && filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-2 p-8 text-center"><Inbox className="h-8 w-8 text-muted-foreground" /><p className="font-medium">No feedback found</p><p className="text-sm text-muted-foreground">Try another search or category.</p></CardContent></Card>
        ) : null}

        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{row.category || "General"}</CardTitle>
                  <time className="text-xs text-muted-foreground" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap break-words text-sm">{row.message || "(empty message)"}</p>
                <p className="break-all border-t border-border pt-2 text-xs text-muted-foreground">User ID: {row.user_id}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
