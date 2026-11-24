import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DiaryEntry, DiaryStore, readDiary, readLegacyDiary, writeDiary } from '@/lib/diaryStorage';
import { connectGoogleDrive, disconnectGoogleDriveSession, getCachedGoogleDriveAccessToken,
  GoogleDriveSyncError, isGoogleDriveAvailable, mergeGoogleDriveDiaryState,
  readGoogleDriveDiarySnapshot, writeGoogleDriveDiarySnapshot } from '@/lib/googleDriveDiary';

async function verifyDiaryUnlocked(userId: string): Promise<boolean> {
  let result: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    result = await supabase.rpc('journal_is_unlocked', { p_user_id: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      throw new Error('Could not reach HabTastic to verify diary access. Check your internet connection and tap refresh to retry.');
    }
    throw error;
  }

  if (result.error) {
    const message = result.error.message || 'Unknown server error';
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      throw new Error('Could not reach HabTastic to verify diary access. Check your internet connection and tap refresh to retry.');
    }
    throw result.error;
  }

  return result.data === true;
}

export function useDiarySync(userId: string, onLocked: () => void) {
  const [initial] = useState(() => {
    try { return { store: readDiary(userId), error: '' }; }
    catch (err) { return { store: null, error: (err as Error).message }; }
  });
  const [store, setStore] = useState(initial.store);
  const current = useRef(store);
  const active = useRef(true);
  const busy = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [synced, setSynced] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(() => {
    try { return !initial.store?.importedLegacy && readLegacyDiary().length > 0; }
    catch { return false; }
  });

  const commit = useCallback((next: DiaryStore) => {
    if (!active.current) return;
    // Persist before replacing the visible copy; a storage failure must not discard it.
    writeDiary(userId, next);
    current.current = next;
    setStore(next);
  }, [userId]);

  const sync = useCallback(async (interactive = false) => {
    if (!active.current || busy.current || !current.current?.cloudSync) return;
    busy.current = true;
    setSyncing(true);
    setSynced(false);
    setSyncError('');
    try {
      const isUnlocked = await verifyDiaryUnlocked(userId);
      if (!active.current) return;
      if (!isUnlocked) {
        onLocked();
        throw new Error('Unlock your diary again to sync.');
      }
      let accessToken = await getCachedGoogleDriveAccessToken(userId);
      if (!accessToken && interactive) accessToken = await connectGoogleDrive(userId);
      if (!accessToken) throw new GoogleDriveSyncError('reconnect', 'Connect your Google account using the sync button.');
      do {
        if (!current.current?.cloudSync || !active.current) return;
        const remote = await readGoogleDriveDiarySnapshot(accessToken, userId);
        if (!active.current) return;
        // Include edits made during the read. Never replace them with an older response.
        const writing = current.current!;
        const merged = mergeGoogleDriveDiaryState(writing.entries, writing.tombstones, remote);
        await writeGoogleDriveDiarySnapshot(accessToken, userId, merged);
        if (!active.current) return;
        const isStillUnlocked = await verifyDiaryUnlocked(userId);
        if (!active.current) return;
        if (!isStillUnlocked) {
          onLocked();
          throw new Error('Unlock your diary again to sync.');
        }
        const latest = current.current!;
        const acknowledged = new Set(writing.entries.filter(e =>
          JSON.stringify(e) === JSON.stringify(latest.entries.find(r => r.id === e.id)),
        ).map(e => e.id));
        const acknowledgedDeletes = new Set(writing.deleted.filter(id =>
          latest.tombstones[id] === writing.tombstones[id],
        ));
        // Also preserve edits/deletes made during the upload, then send them on the next pass.
        const currentMerged = mergeGoogleDriveDiaryState(latest.entries, latest.tombstones, merged);
        commit({ ...latest, entries: currentMerged.entries, tombstones: currentMerged.deleted,
          pending: latest.pending.filter(id => !acknowledged.has(id)),
          deleted: latest.deleted.filter(id => !acknowledgedDeletes.has(id)),
          knownCloudIds: merged.entries.map(e => e.id) });
      } while (current.current?.cloudSync && (current.current.pending.length || current.current.deleted.length));
      if (active.current && current.current?.cloudSync) setSynced(true);
    } catch (err) {
      if (active.current) {
        const message = (err as Error)?.message || 'Please try again when you are online.';
        setSyncError(message);
        toast.error(`Sync failed. Your device copy is kept. ${message}`);
      }
    } finally {
      busy.current = false;
      if (active.current) setSyncing(false);
    }
  }, [userId, commit, onLocked]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (store?.cloudSync) void sync();
    const retry = () => void sync();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [store?.cloudSync, sync]);

  const putEntry = (entry: DiaryEntry) => {
    if (!current.current) return false;
    if (!Number.isFinite(new Date(entry.entryAt).getTime())) {
      toast.error('Choose a valid entry date and time.');
      return false;
    }
    try {
      const previous = current.current;
      const e = { ...entry, updatedAt: new Date().toISOString() };
      commit({ ...previous,
        entries: [e, ...previous.entries.filter(r => r.id !== e.id)],
        pending: [...new Set([...previous.pending, e.id])],
        deleted: previous.deleted.filter(id => id !== e.id),
      });
      setSynced(false);
      void sync();
      return true;
    } catch { toast.error('Could not save on this device. Keep this entry open and free some storage.'); return false; }
  };

  const removeEntry = (id: string) => {
    if (!current.current) return;
    try {
      const previous = current.current;
      commit({ ...previous, entries: previous.entries.filter(e => e.id !== id),
        pending: previous.pending.filter(r => r !== id),
        deleted: [...new Set([...previous.deleted, id])],
        tombstones: { ...previous.tombstones, [id]: new Date().toISOString() },
      });
      setSynced(false);
      void sync();
    } catch { toast.error('Could not delete the device copy. Please free some storage and retry.'); }
  };

  const toggleCloudSync = (enabled: boolean) => {
    if (!current.current) return;
    try {
      const previous = current.current;
      commit({ ...previous, cloudSync: enabled,
        pending: enabled ? [...new Set([...previous.pending, ...previous.entries.filter(e => !previous.knownCloudIds.includes(e.id)).map(e => e.id)])] : previous.pending,
      });
      setSynced(false);
      setSyncError('');
      if (enabled) void sync(true);
      else void disconnectGoogleDriveSession(userId).catch(() => {});
    } catch { toast.error('Could not save the sync setting on this device.'); }
  };

  const importLegacy = () => {
    if (!current.current || !confirm('Only import these previous device entries if they belong to you. They will be added to your account. Continue?')) return;
    try {
      const entries = readLegacyDiary().map(e => ({ ...e, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }));
      const previous = current.current;
      commit({ ...previous, entries: [...entries, ...previous.entries],
        pending: [...previous.pending, ...entries.map(e => e.id)], importedLegacy: true });
      setHasLegacy(false);
      setSynced(false);
      void sync();
    } catch { toast.error('Could not import. The previous device copy has been kept.'); }
  };

  return { entries: store?.entries ?? [], cloudSync: store?.cloudSync ?? false,
    syncing, syncError, localError: initial.error, synced, hasLegacy, driveAvailable: isGoogleDriveAvailable(),
    sync, putEntry, removeEntry, toggleCloudSync, importLegacy };
}
