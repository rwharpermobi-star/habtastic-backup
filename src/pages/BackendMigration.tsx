import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, Download, Upload, Check, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import {
  activeBackendId, listBackends, setPreferredBackend, clearPreferredBackend, type BackendId,
} from '@/integrations/supabase/backendConfig';

type Report = Record<string, unknown> | null;

export default function BackendMigration() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [report, setReport] = useState<Report>(null);
  const backends = listBackends();

  const switchBackend = useCallback((id: BackendId) => {
    if (id === activeBackendId) return;
    try {
      setPreferredBackend(id);
      toast.success('Backend switched — reloading the app…');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, []);

  const resetBackend = useCallback(() => {
    clearPreferredBackend();
    toast.success('Reverted to the build default — reloading…');
    setTimeout(() => window.location.reload(), 600);
  }, []);

  const handleExport = useCallback(async () => {
    setBusy('export');
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke('data-migration', {
        body: { action: 'export' },
      });
      if (error) throw error;
      const bundle = (data as { bundle: unknown }).bundle;
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `habtastic-migration-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setReport((bundle as { counts?: Record<string, number> }).counts ?? null);
      toast.success('Export downloaded 📦');
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setBusy('import');
    setReport(null);
    try {
      const bundle = JSON.parse(await file.text());
      const { data, error } = await supabase.functions.invoke('data-migration', {
        body: { action: 'import', bundle, createUsers: true },
      });
      if (error) throw error;
      setReport((data as { report?: Report }).report ?? null);
      toast.success('Import finished ✅');
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 bg-background text-center">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <p className="text-body text-muted-foreground">Admins only.</p>
        <button onClick={() => navigate('/')} className="text-primary text-body font-medium">Go home</button>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-1">Backend &amp; Migration</h1>
      <p className="text-caption text-muted-foreground mb-6">
        Switch the Supabase backend this build talks to, and move data between projects.
      </p>

      <div className="glass rounded-card shadow-card p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
          <p className="text-body font-medium text-foreground">Active backend</p>
        </div>
        <div className="space-y-2">
          {backends.map((b) => {
            const active = b.id === activeBackendId;
            return (
              <button
                key={b.id}
                disabled={!b.available || active}
                onClick={() => switchBackend(b.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  active ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-secondary/50'
                } ${!b.available ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium text-foreground">{b.label}</p>
                  <p className="text-caption text-muted-foreground truncate">
                    {b.available ? (b.projectId || b.url) : 'Not configured in this build'}
                  </p>
                </div>
                {active && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        <button onClick={resetBackend} className="mt-3 text-caption text-muted-foreground hover:text-foreground">
          Reset to build default
        </button>
      </div>

      <div className="glass rounded-card shadow-card overflow-hidden mb-6">
        <button
          onClick={handleExport}
          disabled={busy !== null}
          className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left border-b border-border/40 disabled:opacity-60"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {busy === 'export'
              ? <Loader2 className="w-[18px] h-[18px] text-primary animate-spin" />
              : <Download className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />}
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Export from active backend</p>
            <p className="text-caption text-muted-foreground">Users, profiles, habits, journals and analytics as JSON</p>
          </div>
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left disabled:opacity-60"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {busy === 'import'
              ? <Loader2 className="w-[18px] h-[18px] text-primary animate-spin" />
              : <Upload className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />}
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Import into active backend</p>
            <p className="text-caption text-muted-foreground">Upserts rows and remaps user ids by email</p>
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
      </div>

      {report && (
        <div className="glass rounded-card shadow-card p-4 mb-6">
          <p className="text-body font-medium text-foreground mb-2">Result</p>
          <pre className="text-caption text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-caption text-muted-foreground">
        Passwords cannot be exported from Supabase Auth — imported users keep their email and must use
        “forgot password” once. Run the export while connected to the source project, switch backend, then import.
      </p>
    </motion.div>
  );
}
