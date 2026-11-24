import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type CoachId = 'winston';
export interface Message { role: 'user' | 'assistant'; content: string; ts?: string }

const COACH_ID: CoachId = 'winston';

export function useCoachChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Cap how many messages we hydrate into memory at once.
  // Server-side prune keeps DB at ≤200/conversation; this is the in-memory window.
  const LOAD_LIMIT = 100;

  // Clear immediately when the authenticated user changes. Without this, React
  // can render the previous user's Winston history while the new user's query
  // is still in flight (especially during fast account switching).
  useEffect(() => {
    setMessages([]);
    setLoaded(false);

    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        // Fetch only the most recent LOAD_LIMIT messages (newest first), then reverse for display
        const { data, error } = await supabase
          .from('chat_messages')
          .select('coach_id, role, content, created_at')
          .eq('user_id', user.id)
          .eq('coach_id', COACH_ID)
          .order('created_at', { ascending: false })
          .limit(LOAD_LIMIT);

        if (cancelled) return;
        if (error) {
          console.warn('[useCoachChat] history load failed:', error.message);
          setMessages([]);
        } else if (data) {
          const ordered = [...data].reverse();
          setMessages(ordered.map(row => ({
            role: row.role as 'user' | 'assistant',
            content: row.content,
            ts: (row).created_at,
          })));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[useCoachChat] history load failed:', error);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }

      if (cancelled) return;

      // Fire-and-forget: trim this user's old AI history server-side.
      // Free tier already gets daily cron prune; this keeps things tidy in real time.
      try {
        // DB signature is (_keep_last integer) only — passing extra args 404s.
        await supabase.rpc('prune_my_chat_messages', { _keep_last: 200 });
      } catch {
        // Non-fatal — the daily cron will catch up.
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [user]);

  // Persist new messages to DB (only user messages — assistant messages are saved server-side)
  const persistMessage = useCallback(async (msg: Message) => {
    if (!user || msg.role !== 'user') return;
    const { error } = await supabase.from('chat_messages').insert({
      user_id: user.id,
      coach_id: COACH_ID,
      role: msg.role,
      content: msg.content,
    });
    if (error) throw error;
  }, [user]);

  // Append and persist a message
  const addMessage = useCallback(async (msg: Message) => {
    setMessages(prev => [...prev, msg]);
    await persistMessage(msg);
  }, [persistMessage]);

  // Update the last assistant message (for streaming)
  const updateLastAssistant = useCallback((content: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
      }
      return [...prev, { role: 'assistant' as const, content, ts: new Date().toISOString() }];
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    if (user) {
      const { error } = await supabase.from('chat_messages').delete().eq('user_id', user.id).eq('coach_id', COACH_ID);
      if (error) throw error;
    }
  }, [user]);

  return {
    activeCoach: COACH_ID,
    messages,
    setMessages,
    addMessage,
    updateLastAssistant,
    clearHistory,
    loaded,
  };
}
