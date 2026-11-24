import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, CloudUpload, RotateCcw, RefreshCw } from 'lucide-react';
import { useHabits } from '@/hooks/useHabits';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function DataSettings() {
  const navigate = useNavigate();
  const { allHabits, resetAll } = useHabits();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          resetAll(),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('habit_save_timeout')), 15_000);
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
      setResetOpen(false);
      setResetConfirmation('');
      toast.success('All habits cleared. Fresh start! 🚀');
    } catch (error) {
      console.error('[DataSettings] reset habits failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Reset failed: ${message}`);
    } finally {
      setResetting(false);
    }
  }, [resetAll, resetting]);

  const handleExport = () => {
    const data = JSON.stringify(allHabits, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habtastic-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported! 📦');
  };

  const Item = ({ icon: Icon, label, desc, onClick, destructive }: {
    icon; label: string; desc: string; onClick: () => void; destructive?: boolean;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left border-b border-border/40 last:border-b-0"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${destructive ? 'bg-destructive/10' : 'bg-primary/10'}`}>
        <Icon className={`w-[18px] h-[18px] ${destructive ? 'text-destructive' : 'text-primary'}`} strokeWidth={1.5} />
      </div>
      <div className="flex-1">
        <p className={`text-body font-medium ${destructive ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
        <p className="text-caption text-muted-foreground">{desc}</p>
      </div>
    </button>
  );

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-6">Data & Progress</h1>

      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        <Item icon={Download} label="Export Progress" desc="Download your data as JSON" onClick={handleExport} />
        <Item icon={CloudUpload} label="Google Drive diary backup" desc="Connect your Google account in My Diary" onClick={() => navigate('/diary')} />
        <Item icon={RefreshCw} label="Diary sync status" desc="Check the latest backup or retry a sync" onClick={() => navigate('/diary')} />
        <Item icon={RotateCcw} label="Reset All Progress" desc="Delete all habits and history" onClick={() => setResetOpen(true)} destructive />
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(open) => {
        setResetOpen(open);
        if (!open) setResetConfirmation('');
      }}>
        <AlertDialogContent className="glass border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-destructive" /> Reset Entire Routine
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <p>This will <strong className="text-destructive">permanently delete all your habits</strong> and their history.</p>
              <p>XP and level will <strong>not</strong> be affected.</p>
              <p className="text-sm mt-2">⚠️ This action cannot be undone. Your XP, level, and achievements will remain unchanged.</p>
            </AlertDialogDescription>
            <p className="pt-2 font-medium text-foreground">To confirm, type <strong>RESET</strong> below.</p>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Type RESET to confirm deleting all habits"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder="Type RESET"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); if (resetConfirmation.trim() !== 'RESET') return; void handleReset(); }}
              disabled={resetting || resetConfirmation.trim() !== 'RESET'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-btn"
            >
              {resetting ? 'Resetting...' : 'Continue and Reset Habits'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
