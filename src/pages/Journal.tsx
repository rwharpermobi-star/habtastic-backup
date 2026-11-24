import { useState, useCallback, useRef, memo, useMemo } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Send, Sparkles, Flame, BookOpen, TrendingUp,
  Trash2, ChevronDown, ChevronUp, Target, Volume2, Square,
  FolderPlus, Folder, FolderOpen, ArrowRight, Plus, X, Edit2, Check, Search
} from 'lucide-react';
import { useJournal, JournalAnalysis } from '@/hooks/useJournal';
import { JournalPasscodeGate } from '@/components/JournalPasscodeGate';
import { JournalPrivateBackupPanel } from '@/components/JournalPrivateBackupPanel';
import { useJournalFolders } from '@/hooks/useJournalFolders';
import { useProfile } from '@/hooks/useProfile';
import { useVoice } from '@/hooks/useVoice';
import { useXPReward } from '@/hooks/useXPReward';
import DailyRewardPopup from '@/components/DailyRewardPopup';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';

const MOOD_GRADIENTS: Record<string, string> = {
  happy: 'from-yellow-400/20 to-orange-300/10',
  sad: 'from-blue-400/20 to-indigo-300/10',
  stressed: 'from-red-400/20 to-orange-400/10',
  motivated: 'from-emerald-400/20 to-green-300/10',
  neutral: 'from-slate-300/20 to-gray-200/10',
  anxious: 'from-amber-400/20 to-yellow-300/10',
  grateful: 'from-purple-400/20 to-pink-300/10',
  angry: 'from-red-500/20 to-red-300/10',
};

const FOLDER_EMOJIS = ['📁', '💼', '❤️', '⭐', '🎯', '💡', '📝', '🏠', '💪', '🧠'];

const JournalEntryCard = memo(function JournalEntryCard({
  entry,
  moodColors,
  moodEmojis,
  onDelete,
  onSpeak,
  isSpeaking,
  speakingId,
  onStopSpeaking,
  folders,
  onMoveToFolder,
}: {
  entry;
  moodColors: Record<string, string>;
  moodEmojis: Record<string, string>;
  onDelete: (id: string) => void;
  onSpeak: (text: string, id: string) => void;
  isSpeaking: boolean;
  speakingId: string | null;
  onStopSpeaking: () => void;
  folders: any[];
  onMoveToFolder: (entryId: string, folderId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const dateLabel = isToday(new Date(entry.created_at))
    ? 'Today'
    : isYesterday(new Date(entry.created_at))
    ? 'Yesterday'
    : format(new Date(entry.created_at), 'MMM d');
  const timeLabel = format(new Date(entry.created_at), 'h:mm a');
  const gradient = MOOD_GRADIENTS[entry.mood] || MOOD_GRADIENTS.neutral;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-2xl border border-border/40 bg-gradient-to-br ${gradient} backdrop-blur-sm p-4 transition-all`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{moodEmojis[entry.mood] || '😐'}</span>
          <div>
            <span className="text-xs font-medium text-muted-foreground">{dateLabel} · {timeLabel}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: moodColors[entry.mood] || moodColors.neutral }}
              />
              <span className="text-xs capitalize text-foreground/70">{entry.mood}</span>
              {entry.is_voice && <Mic className="w-3 h-3 text-muted-foreground" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {entry.ai_feedback && (
            <button
              onClick={() => {
                if (isSpeaking && speakingId === entry.id) {
                  onStopSpeaking();
                } else {
                  onSpeak(entry.ai_feedback, entry.id);
                }
              }}
              className={`p-1 rounded-lg transition-all ${
                isSpeaking && speakingId === entry.id
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-background/50 text-muted-foreground'
              }`}
            >
              {isSpeaking && speakingId === entry.id ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {/* Move to folder */}
          <div className="relative">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              className="p-1 rounded-lg hover:bg-background/50 text-muted-foreground"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showMoveMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute right-0 top-7 z-50 bg-card border border-border rounded-xl shadow-lg p-2 min-w-[140px]"
                >
                  <button
                    onClick={() => { onMoveToFolder(entry.id, null); setShowMoveMenu(false); }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted flex items-center gap-2"
                  >
                    <BookOpen className="w-3 h-3" /> No folder
                  </button>
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => { onMoveToFolder(entry.id, f.id); setShowMoveMenu(false); }}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted flex items-center gap-2"
                    >
                      <span>{f.emoji}</span> {f.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg hover:bg-background/50 text-muted-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className={`mt-2 text-sm text-foreground/80 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
        {entry.content}
      </p>

      {entry.topics?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.topics.map((t: string) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-background/60 text-muted-foreground capitalize">
              {t}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {expanded && entry.ai_feedback && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-border/30">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-medium text-accent">Coach Insight</span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">{entry.ai_feedback}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const WeeklyInsightsPanel = memo(function WeeklyInsightsPanel({
  insights,
  moodEmojis,
  moodColors,
}: {
  insights;
  moodEmojis: Record<string, string>;
  moodColors: Record<string, string>;
}) {
  if (!insights) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">Weekly Insights</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">{insights.totalEntries}</div>
          <div className="text-[10px] text-muted-foreground">Entries</div>
        </div>
        <div className="text-center">
          <div className="text-2xl">{moodEmojis[insights.dominantMood] || '😐'}</div>
          <div className="text-[10px] text-muted-foreground capitalize">{insights.dominantMood}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-0.5">
            {insights.streak}<Flame className="w-4 h-4 text-accent" />
          </div>
          <div className="text-[10px] text-muted-foreground">Streak</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {Object.entries(insights.moodCounts as Record<string, number>)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 4)
          .map(([mood, count]) => (
            <div key={mood} className="flex items-center gap-2">
              <span className="text-xs w-16 capitalize text-muted-foreground">{mood}</span>
              <div className="flex-1 h-2 rounded-full bg-background/50 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((count as number) / insights.totalEntries) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: moodColors[mood] || moodColors.neutral }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-4 text-right">{count as number}</span>
            </div>
          ))}
      </div>

      {insights.topTopics.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground">Top topics: </span>
          <span className="text-xs text-foreground/70">{insights.topTopics.join(', ')}</span>
        </div>
      )}
    </motion.div>
  );
});

export default function Journal() {
  return <JournalPasscodeGate><UnlockedJournal /></JournalPasscodeGate>;
}

function UnlockedJournal() {
  usePageMeta({
    title: 'Habit Journal & Reflections — HabTastic AI',
    description: 'Capture daily reflections, moods and notes alongside your habit progress in the HabTastic AI journal.',
    canonicalPath: '/journal',
  });

  const { profile } = useProfile();
  const {
    entries,
    entriesLoading,
    isAnalyzing,
    weeklyInsights,
    analyzeEntry,
    saveEntry,
    deleteEntry,
    MOOD_COLORS,
    MOOD_EMOJIS,
  } = useJournal();
  const { folders, createFolder, deleteFolder, renameFolder, moveEntryToFolder } = useJournalFolders();
  const { awardXP, pendingReward, clearReward } = useXPReward();

  const { speak, stopSpeaking, isSpeaking } = useVoice({ coachGender: (profile?.coach_gender as 'male' | 'female') || 'female' });

  const [text, setText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<JournalAnalysis | null>(null);
  const [showGoalPrompt, setShowGoalPrompt] = useState<string | null>(null);
  const [speakingEntryId, setSpeakingEntryId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleSpeak = useCallback((feedbackText: string, entryId: string) => {
    setSpeakingEntryId(entryId);
    speak(feedbackText);
  }, [speak]);

  const handleStopSpeaking = useCallback(() => {
    stopSpeaking();
    setSpeakingEntryId(null);
  }, [stopSpeaking]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Filter entries by folder
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (selectedFolderId !== null) {
      result = result.filter((e: any) => e.folder_id === selectedFolderId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        e.content.toLowerCase().includes(q) ||
        e.mood.toLowerCase().includes(q) ||
        (e.topics && e.topics.some((t: string) => t.toLowerCase().includes(q)))
      );
    }
    return result;
  }, [entries, selectedFolderId, searchQuery]);

  const handleSend = useCallback(async () => {
    if (!text.trim()) return;
    const content = text.trim();
    setText('');

    const analysis = await analyzeEntry(content);
    const saved = await saveEntry(content, analysis, false);

    // XP is claimed against the saved entry id — the server verifies the entry
    // exists, is ours, is a written (not voice) entry, and wasn't rewarded yet.
    if (saved?.id) await awardXP('journal_write', { refId: saved.id });

    // Move to selected folder if one is active
    if (saved && selectedFolderId) {
      await moveEntryToFolder(saved.id, selectedFolderId);
    }

    if (saved && analysis?.detected_goal) {
      setShowGoalPrompt(analysis.detected_goal);
    }

    if (analysis) {
      setPendingAnalysis(analysis);
      // Extra XP for AI feedback — also proven by the stored entry, which must
      // actually carry ai_feedback for the server to pay out.
      if (saved?.id) await awardXP('journal_ai_feedback', { refId: saved.id });
      setTimeout(() => setPendingAnalysis(null), 5000);
    }
  }, [text, analyzeEntry, saveEntry, selectedFolderId, moveEntryToFolder, awardXP]);

  const handleGetFeedback = useCallback(async () => {
    if (!text.trim()) {
      toast('Write something first, then ask for feedback');
      return;
    }
    const analysis = await analyzeEntry(text.trim());
    if (analysis) {
      setPendingAnalysis(analysis);
      toast.success(`Mood detected: ${MOOD_EMOJIS[analysis.mood] || '😐'} ${analysis.mood}`);
    }
  }, [text, analyzeEntry, MOOD_EMOJIS]);

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input not supported on this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      toast.error('Voice input failed');
    };

    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), newFolderEmoji);
    setNewFolderName('');
    setNewFolderEmoji('📁');
    setShowNewFolder(false);
    toast.success('Folder created!');
  }, [newFolderName, newFolderEmoji, createFolder]);

  const handleRenameFolder = useCallback(async (id: string) => {
    if (!editFolderName.trim()) return;
    await renameFolder(id, editFolderName.trim());
    setEditingFolderId(null);
    setEditFolderName('');
  }, [editFolderName, renameFolder]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-sm text-muted-foreground">{greeting}, <span className="font-signature text-lg text-foreground align-middle">{profile?.name || 'Hero'}</span></p>
          <h1 className="text-2xl font-bold text-foreground mt-0.5">My thoughts for the day</h1>
        </motion.div>

        <JournalPrivateBackupPanel />

        <div className="flex items-center gap-4 mt-3">
          {weeklyInsights && (
            <>
              <div className="flex items-center gap-1 text-sm">
                <Flame className="w-4 h-4 text-accent" />
                <span className="font-semibold">{weeklyInsights.streak}</span>
                <span className="text-muted-foreground text-xs">day streak</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <BookOpen className="w-4 h-4 text-accent" />
                <span className="font-semibold">{entries.length}</span>
                <span className="text-muted-foreground text-xs">entries</span>
              </div>
            </>
          )}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="text-xs text-muted-foreground hover:text-accent transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="text-xs text-accent font-medium flex items-center gap-1"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Insights
          </button>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by content, mood, or topic..."
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-muted/50 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Weekly Insights */}
      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 overflow-hidden"
          >
            <WeeklyInsightsPanel insights={weeklyInsights} moodEmojis={MOOD_EMOJIS} moodColors={MOOD_COLORS} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folders Section */}
      <div className="px-5 mt-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
          {/* All entries tab */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
              selectedFolderId === null
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            All
          </button>

          {/* Folder tabs */}
          {folders.map(folder => (
            <div key={folder.id} className="shrink-0 flex items-center relative group">
              {editingFolderId === folder.id ? (
                <div className="flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1">
                  <input
                    value={editFolderName}
                    onChange={e => setEditFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(folder.id); }}
                    className="w-20 text-xs bg-transparent outline-none"
                    autoFocus
                  />
                  <button onClick={() => handleRenameFolder(folder.id)} className="text-accent">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingFolderId(null)} className="text-muted-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  onDoubleClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                    selectedFolderId === folder.id
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span>{folder.emoji}</span>
                  {folder.name}
                </button>
              )}
              {/* Long press / right-click to delete */}
              {selectedFolderId === folder.id && editingFolderId !== folder.id && (
                <div className="flex items-center ml-1 gap-0.5">
                  <button
                    onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                    className="p-0.5 rounded text-accent/70 hover:text-accent"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { deleteFolder(folder.id); setSelectedFolderId(null); }}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add folder button */}
          <button
            onClick={() => setShowNewFolder(true)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20 transition-all active:scale-95"
          >
            <FolderPlus className="w-3 h-3" />
            New
          </button>
        </div>

        {/* New Folder Dialog */}
        <AnimatePresence>
          {showNewFolder && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card border border-border/50 rounded-2xl p-3 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">New Folder</span>
                  <button onClick={() => setShowNewFolder(false)} className="ml-auto text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {FOLDER_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setNewFolderEmoji(emoji)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all ${
                        newFolderEmoji === emoji ? 'bg-accent/20 ring-2 ring-accent' : 'bg-muted'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                    placeholder="Folder name..."
                    className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-accent/50"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium active:scale-95 transition-all disabled:opacity-30"
                  >
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Goal detection prompt */}
      <AnimatePresence>
        {showGoalPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-5 mt-3 p-3 rounded-2xl border border-accent/30 bg-accent/5"
          >
            <div className="flex items-start gap-2">
              <Target className="w-5 h-5 text-accent mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Goal detected!</p>
                <p className="text-xs text-muted-foreground mt-0.5">"{showGoalPrompt}"</p>
                <p className="text-xs text-muted-foreground mt-1">Would you like to turn this into a habit?</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { toast.success('Head to Habits to create it!'); setShowGoalPrompt(null); }}
                    className="text-xs px-3 py-1.5 rounded-full bg-accent text-accent-foreground font-medium active:scale-95 transition-transform"
                  >
                    Yes, create habit
                  </button>
                  <button
                    onClick={() => setShowGoalPrompt(null)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-medium active:scale-95 transition-transform"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis feedback */}
      <AnimatePresence>
        {pendingAnalysis && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mx-5 mt-3 p-3 rounded-2xl bg-card/90 border border-border/40 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-accent">Coach Feedback</span>
              <button
                onClick={() => {
                  if (isSpeaking && speakingEntryId === 'pending') handleStopSpeaking();
                  else handleSpeak(pendingAnalysis.feedback, 'pending');
                }}
                className={`p-1 rounded-lg transition-all ${
                  isSpeaking && speakingEntryId === 'pending'
                    ? 'bg-accent/10 text-accent'
                    : 'hover:bg-background/50 text-muted-foreground'
                }`}
              >
                {isSpeaking && speakingEntryId === 'pending' ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <span className="ml-auto text-lg">{MOOD_EMOJIS[pendingAnalysis.mood]}</span>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{pendingAnalysis.feedback}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries Timeline */}
      <div className="px-5 mt-4 space-y-3">
        {entriesLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-card/50 animate-pulse h-24" />
          ))
        ) : filteredEntries.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            {selectedFolderId ? (
              <>
                <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">This folder is empty</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Move entries here or write a new one</p>
              </>
            ) : (
              <>
                <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Start writing to begin your journey</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Your entries are saved securely in the cloud</p>
              </>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                moodColors={MOOD_COLORS}
                moodEmojis={MOOD_EMOJIS}
                onDelete={deleteEntry}
                onSpeak={handleSpeak}
                isSpeaking={isSpeaking}
                speakingId={speakingEntryId}
                onStopSpeaking={handleStopSpeaking}
                folders={folders}
                onMoveToFolder={moveEntryToFolder}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Input Bar */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-lg mx-auto bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-lg p-3"
        >
          {selectedFolderId && (
            <div className="flex items-center gap-1 mb-1.5">
              <Folder className="w-3 h-3 text-accent" />
              <span className="text-[10px] text-accent">
                Saving to: {folders.find(f => f.id === selectedFolderId)?.name}
              </span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind..."
            rows={2}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={toggleVoice}
                className={`p-2 rounded-xl transition-all active:scale-90 ${
                  isRecording
                    ? 'bg-destructive/10 text-destructive'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={handleGetFeedback}
                disabled={isAnalyzing || !text.trim()}
                className="p-2 rounded-xl text-accent hover:bg-accent/10 transition-all active:scale-90 disabled:opacity-30"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || isAnalyzing}
              className="p-2 rounded-xl bg-accent text-accent-foreground transition-all active:scale-90 disabled:opacity-30"
            >
              {isAnalyzing ? (
                <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </motion.div>
      </div>

      {/* XP Reward Popup */}
      {pendingReward && (
        <DailyRewardPopup xpEarned={pendingReward.amount} reason={pendingReward.reason} onClose={clearReward} />
      )}
    </div>
  );
}
