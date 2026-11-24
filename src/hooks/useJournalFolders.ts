import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteLocalJournalFolder, moveLocalJournalEntry, readLocalJournalFolders, updateLocalJournalFolderName, upsertLocalJournalFolder } from '@/lib/journalPrivateRepository';
import { hasCompleteJournalPrivateLocalSnapshot } from '@/lib/journalPrivateStorage';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface JournalFolder {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  created_at: string;
}

export function useJournalFolders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['journal-folders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const localFolders = readLocalJournalFolders(user.id);
      if (localFolders !== null) return localFolders as JournalFolder[];
      const { data, error } = await untypedSupabase
        .from('journal_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as JournalFolder[];
    },
    enabled: !!user,
  });

  const createFolder = useCallback(async (name: string, emoji = '📁', color = 'hsl(27, 100%, 50%)') => {
    if (!user) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!hasCompleteJournalPrivateLocalSnapshot(user.id)) {
        toast.error('Prepare your device copy before using Journal offline.');
        return null;
      }
      const createdAt = new Date().toISOString();
      const folder: JournalFolder = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `local-folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        user_id: user.id,
        name,
        emoji,
        color,
        created_at: createdAt,
      };
      try {
        upsertLocalJournalFolder(user.id, folder);
        queryClient.setQueryData(['journal-folders', user.id], (current: JournalFolder[] | undefined) =>
          [...(current || []), folder].sort((a, b) => a.created_at.localeCompare(b.created_at))
        );
        toast.message('Folder saved on this device. Sync Google Drive when online.');
        return folder;
      } catch (localError) {
        console.error('Offline folder creation failed:', localError);
        toast.error('Could not save the folder on this device.');
        return null;
      }
    }
    const { data, error } = await untypedSupabase
      .from('journal_folders')
      .insert({ user_id: user.id, name, emoji, color })
      .select()
      .single();
    if (error) {
      toast.error('Failed to create folder');
      return null;
    }
    const savedFolder = data as unknown as JournalFolder;
    try {
      upsertLocalJournalFolder(user.id, savedFolder);
    } catch (localError) {
      console.error('Could not update local Journal folder copy:', localError);
      toast.error('Folder created, but the device copy could not be updated.');
    }
    queryClient.invalidateQueries({ queryKey: ['journal-folders'] });
    return savedFolder;
  }, [user, queryClient]);

  const deleteFolder = useCallback(async (id: string) => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline && (!user?.id || !hasCompleteJournalPrivateLocalSnapshot(user.id))) {
      toast.error('Prepare your device copy before changing folders offline.');
      return;
    }
    const { error } = offline
      ? { error: null }
      : await untypedSupabase.from('journal_folders').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete folder');
      return;
    }
    if (user?.id) {
      try { deleteLocalJournalFolder(user.id, id); }
      catch (localError) {
        console.error('Could not update local Journal folder deletion:', localError);
        toast.error('Folder deleted from your account, but the device copy could not be updated.');
      }
    }
    queryClient.invalidateQueries({ queryKey: ['journal-folders'] });
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
  }, [queryClient, user?.id]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline && (!user?.id || !hasCompleteJournalPrivateLocalSnapshot(user.id))) {
      toast.error('Prepare your device copy before changing folders offline.');
      return;
    }
    const { error } = offline
      ? { error: null }
      : await untypedSupabase.from('journal_folders').update({ name }).eq('id', id);
    if (error) {
      toast.error('Failed to rename folder');
      return;
    }
    if (user?.id) {
      try { updateLocalJournalFolderName(user.id, id, name); }
      catch (localError) {
        console.error('Could not update local Journal folder name:', localError);
        toast.error('Folder renamed in your account, but the device copy could not be updated.');
      }
    }
    queryClient.invalidateQueries({ queryKey: ['journal-folders'] });
  }, [queryClient, user?.id]);

  const moveEntryToFolder = useCallback(async (entryId: string, folderId: string | null) => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline && (!user?.id || !hasCompleteJournalPrivateLocalSnapshot(user.id))) {
      toast.error('Prepare your device copy before moving entries offline.');
      return;
    }
    const { error } = offline
      ? { error: null }
      : await supabase
        .from('journal_entries')
        .update({ folder_id: folderId })
        .eq('id', entryId);
    if (error) {
      toast.error('Failed to move entry');
      return;
    }
    if (user?.id) {
      try { moveLocalJournalEntry(user.id, entryId, folderId); }
      catch (localError) {
        console.error('Could not update local Journal folder assignment:', localError);
        toast.error('Entry moved in your account, but the device copy could not be updated.');
      }
    }
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
  }, [queryClient, user?.id]);

  return { folders, isLoading, createFolder, deleteFolder, renameFolder, moveEntryToFolder };
}
