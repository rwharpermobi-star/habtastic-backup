import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Cloud, Database, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { migrateJournalFromSupabaseToLocal } from '@/lib/journalSupabaseMigration';
import { connectPrivateDataDrive, isGoogleDrivePrivateDataAvailable } from '@/lib/googleDrivePrivateData';
import { syncJournalPrivateData, type JournalPrivateSyncResult } from '@/lib/journalPrivateSync';
import { hasCompleteJournalPrivateLocalSnapshot } from '@/lib/journalPrivateStorage';

export function JournalPrivateBackupPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'migration' | 'sync' | null>(null);
  const [message, setMessage] = useState('');
  const [syncResult, setSyncResult] = useState<JournalPrivateSyncResult | null>(null);
  const driveAvailable = isGoogleDrivePrivateDataAvailable();

  const prepareDeviceCopy = async () => {
    if (!user?.id || busy) return;
    setBusy('migration');
    setMessage('');
    try {
      const imported = await migrateJournalFromSupabaseToLocal(user.id);
      if (hasCompleteJournalPrivateLocalSnapshot(user.id)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['journal-entries', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['journal-folders', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['journal-memories', user.id] }),
        ]);
      }
      setMessage(imported
        ? 'Your existing Journal entries, folders and memories were copied to this device. Your server copy was not deleted.'
        : 'A local Journal copy already exists, so no import was made. Existing local data was left untouched.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare a local Journal copy. Your server data was not changed.');
    } finally {
      setBusy(null);
    }
  };

  const connectAndSync = async () => {
    if (!user?.id || busy || !driveAvailable) return;
    setBusy('sync');
    setMessage('');
    setSyncResult(null);
    try {
      // Ensure legacy Journal rows are copied locally before the first Drive
      // upload, so a first-time connection cannot create an empty backup.
      const imported = await migrateJournalFromSupabaseToLocal(user.id);
      if (!hasCompleteJournalPrivateLocalSnapshot(user.id)) {
        throw new Error('Your local Journal copy is incomplete. No Drive upload was started. Use “Prepare device copy” again or contact support before syncing.');
      }
      if (imported) {
        setMessage('Existing Journal data copied to this device. Connecting Google Drive…');
      }
      await connectPrivateDataDrive(user.id);
      const result = await syncJournalPrivateData(user.id);
      setSyncResult(result);
      setMessage(result.message);
      if (result.status === 'synced') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['journal-entries', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['journal-folders', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['journal-memories', user.id] }),
        ]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google Drive sync could not be completed. Your existing data was kept.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-border/50 bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Private Journal backup</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Prepare a device copy of your existing Journal, then connect Google Drive for private cross-device backup. This does not delete your existing server copy.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void prepareDeviceCopy()}
          disabled={!user?.id || busy !== null}
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'migration' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {busy === 'migration' ? 'Preparing copy…' : 'Prepare device copy'}
        </button>
        <button
          type="button"
          onClick={() => void connectAndSync()}
          disabled={!user?.id || busy !== null || !driveAvailable}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'sync' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          {busy === 'sync' ? 'Connecting & syncing…' : 'Connect & sync Google Drive'}
        </button>
      </div>

      {!driveAvailable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Google Drive sync is available in the installed Android app. You can still prepare a local copy here.
        </p>
      )}
      {message && (
        <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-foreground">
          {message}
        </p>
      )}
      {syncResult?.status === 'synced' && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Confirmed on Google Drive: {syncResult.entries} entries, {syncResult.folders} folders and {syncResult.memories} memories.
        </p>
      )}
    </section>
  );
}
