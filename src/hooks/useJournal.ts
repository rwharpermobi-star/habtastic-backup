import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteLocalJournalEntry, readLocalJournalEntries, readLocalJournalMemories, upsertLocalJournalEntry, upsertLocalJournalMemory } from '@/lib/journalPrivateRepository';
import { hasCompleteJournalPrivateLocalSnapshot } from '@/lib/journalPrivateStorage';

export interface JournalEntry {
  id: string;
  user_id: string;
  content: string;
  mood: string;
  mood_intensity: number;
  topics: string[];
  ai_feedback: string | null;
  is_voice: boolean;
  created_at: string;
}

export interface JournalMemory {
  id: string;
  user_id: string;
  memory_type: string;
  content: string;
  relevance_score: number;
  created_at: string;
}

export interface JournalAnalysis {
  mood: string;
  mood_intensity: number;
  topics: string[];
  detected_goal: string | null;
  key_insight: string | null;
  feedback: string;
}

const MOOD_COLORS: Record<string, string> = {
  happy: 'hsl(48, 96%, 53%)',
  sad: 'hsl(220, 70%, 55%)',
  stressed: 'hsl(0, 72%, 55%)',
  motivated: 'hsl(142, 72%, 54%)',
  neutral: 'hsl(215, 15%, 60%)',
  anxious: 'hsl(30, 90%, 55%)',
  grateful: 'hsl(280, 60%, 60%)',
  angry: 'hsl(0, 85%, 45%)',
};

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊',
  sad: '😔',
  stressed: '😰',
  motivated: '💪',
  neutral: '😐',
  anxious: '😟',
  grateful: '🙏',
  angry: '😤',
};

export function useJournal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['journal-entries', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const localEntries = readLocalJournalEntries(user.id);
      if (localEntries !== null) return localEntries as JournalEntry[];
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as JournalEntry[];
    },
    enabled: !!user,
  });

  const { data: memories = [] } = useQuery({
    queryKey: ['journal-memories', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const localMemories = readLocalJournalMemories(user.id);
      if (localMemories !== null) return localMemories as JournalMemory[];
      const { data, error } = await supabase
        .from('journal_memories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as JournalMemory[];
    },
    enabled: !!user,
  });

  const weeklyEntries = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return entries.filter(e => new Date(e.created_at) >= weekAgo);
  }, [entries]);

  const weeklyInsights = useMemo(() => {
    if (weeklyEntries.length === 0) return null;
    const moodCounts: Record<string, number> = {};
    weeklyEntries.forEach(e => {
      moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
    });
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
    const avgIntensity = weeklyEntries.reduce((s, e) => s + e.mood_intensity, 0) / weeklyEntries.length;
    const allTopics = weeklyEntries.flatMap(e => e.topics);
    const topicCounts: Record<string, number> = {};
    allTopics.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

    return {
      totalEntries: weeklyEntries.length,
      dominantMood,
      avgIntensity: Math.round(avgIntensity * 10) / 10,
      moodCounts,
      topTopics,
      streak: calculateStreak(entries),
    };
  }, [weeklyEntries, entries]);

  const analyzeEntry = useCallback(async (content: string): Promise<JournalAnalysis | null> => {
    if (!user) return null;
    setIsAnalyzing(true);
    try {
      const recentEntries = entries
        .slice(0, 10)
        .map(entry => ({
          mood: entry.mood.slice(0, 30),
          content: entry.content.slice(0, 300),
          createdAt: entry.created_at,
        }));
      const memoryContext = memories
        .slice(0, 20)
        .map(memory => ({
          type: memory.memory_type.slice(0, 40),
          content: memory.content.slice(0, 300),
          createdAt: memory.created_at,
        }));

      const response = await supabase.functions.invoke('journal-analyze', {
        body: { content, context: { memories: memoryContext, recentEntries } },
      });

      if (response.error) throw response.error;
      return response.data as JournalAnalysis;
    } catch (err) {
      console.error('Analysis error:', err);
      toast.error('Could not analyze entry');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, entries, memories]);

  const saveEntry = useCallback(async (
    content: string,
    analysis: JournalAnalysis | null,
    isVoice = false
  ) => {
    if (!user) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false &&
        hasCompleteJournalPrivateLocalSnapshot(user.id)) {
      const createdAt = new Date().toISOString();
      const localEntry: JournalEntry = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        user_id: user.id,
        content,
        mood: analysis?.mood || 'neutral',
        mood_intensity: analysis?.mood_intensity || 5,
        topics: analysis?.topics || [],
        ai_feedback: analysis?.feedback || null,
        is_voice: isVoice,
        created_at: createdAt,
      };
      try {
        upsertLocalJournalEntry(user.id, localEntry);
        if (analysis?.key_insight) {
          upsertLocalJournalMemory(user.id, {
            id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            user_id: user.id,
            memory_type: 'insight',
            content: analysis.key_insight,
            relevance_score: (analysis.mood_intensity || 5) / 10,
            created_at: createdAt,
          });
          queryClient.invalidateQueries({ queryKey: ['journal-memories'] });
        }
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
        toast.message('Saved on this device. Connect Google Drive when online to back it up.');
        return localEntry;
      } catch (localError) {
        console.error('Offline Journal save failed:', localError);
        toast.error('Could not save Journal entry on this device.');
        return null;
      }
    }
    const entry = {
      user_id: user.id,
      content,
      mood: analysis?.mood || 'neutral',
      mood_intensity: analysis?.mood_intensity || 5,
      topics: analysis?.topics || [],
      ai_feedback: analysis?.feedback || null,
      is_voice: isVoice,
    };

    const { data, error } = await supabase
      .from('journal_entries')
      .insert(entry)
      .select()
      .single();

    if (error) {
      if (hasCompleteJournalPrivateLocalSnapshot(user.id)) {
        const createdAt = new Date().toISOString();
        const localEntry: JournalEntry = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...entry,
          created_at: createdAt,
        };
        try {
          upsertLocalJournalEntry(user.id, localEntry);
          queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
          toast.message('Saved on this device. Connect Google Drive when online to back it up.');
          return localEntry;
        } catch (localError) {
          console.error('Offline Journal save failed:', localError);
        }
      }
      toast.error('Failed to save entry');
      return null;
    }

    const savedEntry = data as JournalEntry;
    try {
      upsertLocalJournalEntry(user.id, savedEntry);
    } catch (localError) {
      console.error('Could not update local Journal copy:', localError);
      toast.error('Entry saved to your account, but the device copy could not be updated.');
    }

    // Store key insight as memory
    if (analysis?.key_insight) {
      const { data: memoryData, error: memoryError } = await supabase.from('journal_memories').insert({
        user_id: user.id,
        memory_type: 'insight',
        content: analysis.key_insight,
        relevance_score: (analysis.mood_intensity || 5) / 10,
      }).select().single();
      if (!memoryError && memoryData) {
        try {
          upsertLocalJournalMemory(user.id, {
            ...(memoryData),
            user_id: user.id,
            memory_type: (memoryData).memory_type,
            relevance_score: (memoryData).relevance_score,
            created_at: (memoryData).created_at,
          });
        } catch (localError) {
          console.error('Could not update local Journal memory copy:', localError);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['journal-memories'] });
    }

    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    return savedEntry;
  }, [user, queryClient]);

  const deleteEntry = useCallback(async (id: string) => {
    if (user?.id && typeof navigator !== 'undefined' && navigator.onLine === false &&
        hasCompleteJournalPrivateLocalSnapshot(user.id)) {
      try {
        deleteLocalJournalEntry(user.id, id);
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
        toast.message('Deleted from this device. Google Drive will sync the deletion when connected.');
      } catch (localError) {
        console.error('Offline Journal deletion failed:', localError);
        toast.error('Could not delete this entry on the device.');
      }
      return;
    }
    const { error } = await supabase.from('journal_entries').delete().eq('id', id);
    if (error && (!user?.id || !hasCompleteJournalPrivateLocalSnapshot(user.id))) {
      toast.error('Failed to delete entry');
      return;
    }
    if (user?.id) {
      try {
        deleteLocalJournalEntry(user.id, id);
      } catch (localError) {
        console.error('Could not update local Journal deletion:', localError);
        toast.error('Entry deleted from your account, but the device copy could not be updated.');
      }
    }
    if (error) toast.message('Deleted from this device. Google Drive will sync the deletion when connected.');
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
  }, [queryClient, user?.id]);

  return {
    entries,
    memories,
    entriesLoading,
    isAnalyzing,
    weeklyInsights,
    analyzeEntry,
    saveEntry,
    deleteEntry,
    MOOD_COLORS,
    MOOD_EMOJIS,
  };
}

function calculateStreak(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    const hasEntry = entries.some(e => e.created_at.startsWith(dateStr));
    if (hasEntry) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}
