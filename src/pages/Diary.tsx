import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, NotebookPen, Calendar, Clock, Save, X,
  Search, Download, Check,
} from 'lucide-react';
import { Cloud, CloudOff as CloudOffIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { JournalPasscodeGate } from '@/components/JournalPasscodeGate';
import { useDiarySync } from '@/hooks/useDiarySync';
import type { DiaryEntry } from '@/lib/diaryStorage';
import { useAuth } from '@/contexts/AuthContext';

const MOODS = [
  { id: 'happy', label: 'Happy', emoji: '😊' },
  { id: 'calm', label: 'Calm', emoji: '😌' },
  { id: 'grateful', label: 'Grateful', emoji: '🙏' },
  { id: 'motivated', label: 'Motivated', emoji: '💪' },
  { id: 'neutral', label: 'Neutral', emoji: '😐' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'sad', label: 'Sad', emoji: '😔' },
  { id: 'anxious', label: 'Anxious', emoji: '😰' },
  { id: 'angry', label: 'Angry', emoji: '😠' },
] as const;

type MoodId = typeof MOODS[number]['id'];

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function moodOf(id?: string) {
  return MOODS.find(m => m.id === id);
}

async function exportPdf(entries: DiaryEntry[]) {
  if (entries.length === 0) {
    toast.error('No entries to export');
    return;
  }
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('My Diary', margin, y);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Exported ${new Date().toLocaleString()} • ${entries.length} entries`, margin, y);
  doc.setTextColor(0);
  y += 24;

  const sorted = [...entries].sort(
    (a, b) => new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime(),
  );

  for (const e of sorted) {
    if (y > pageHeight - margin - 80) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const title = (e.title.trim() || 'Untitled entry');
    doc.text(title, margin, y);
    y += 16;

    const m = moodOf(e.mood);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    const meta = `${formatEntryDate(e.entryAt)}${m ? ` • Mood: ${m.label}` : ''}`;
    doc.text(meta, margin, y);
    doc.setTextColor(0);
    y += 14;

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(e.content || '', maxWidth);
    for (const line of lines as string[]) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 14;
    }
    y += 10;
    doc.setDrawColor(220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
  }

  doc.save(`diary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function Diary() {
  const { user } = useAuth();
  const [unlockAttempt, setUnlockAttempt] = useState(0);
  const relock = useCallback(() => setUnlockAttempt(n => n + 1), []);
  if (!user) return <p className="p-6">Sign in to open your diary.</p>;
  return (
    <JournalPasscodeGate key={`${user.id}:${unlockAttempt}`}>
      <UnlockedDiary key={user.id} userId={user.id} onLocked={relock} />
    </JournalPasscodeGate>
  );
}

function UnlockedDiary({ userId, onLocked }: { userId: string; onLocked: () => void }) {
  const navigate = useNavigate();
  const { entries, cloudSync, syncing, syncError, localError, synced, hasLegacy, driveAvailable,
    sync, putEntry, removeEntry, toggleCloudSync, importLegacy } = useDiarySync(userId, onLocked);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [query, setQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState<MoodId | 'all'>('all');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  // Auto-save in-place while editing (debounced)
  useEffect(() => {
    if (!showEditor || !editing) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (!editing) return;
      if (!editing.content.trim() && !editing.title.trim()) return;
      if (putEntry(editing)) setSavedAt(Date.now());
    }, 600);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [editing, showEditor]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .filter(e => moodFilter === 'all' || e.mood === moodFilter)
      .filter(e => {
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime());
  }, [entries, query, moodFilter]);

  const openNew = () => {
    setEditing({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      entryAt: nowLocalInput(),
      createdAt: new Date().toISOString(),
      mood: undefined,
    });
    setSavedAt(null);
    setShowEditor(true);
  };

  const openEdit = (e: DiaryEntry) => {
    setEditing({ ...e });
    setSavedAt(null);
    setShowEditor(true);
  };

  const closeEditor = () => {
    if (editing && (editing.content.trim() || editing.title.trim())) {
      if (!putEntry(editing)) return;
    }
    setShowEditor(false);
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    removeEntry(id);
  };

  const savedLabel = savedAt
    ? `Saved on this device ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Auto-save on';

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-h1 text-foreground flex items-center gap-2">
            <NotebookPen className="w-6 h-6 text-primary" />
            My Diary
          </h1>
          <p className="text-caption text-muted-foreground flex items-center gap-1.5">
            {cloudSync ? <Cloud className="w-3 h-3 text-primary" /> : <CloudOffIcon className="w-3 h-3" />}
            {cloudSync ? (syncing ? 'Syncing…' : syncError ? 'Sync failed — device copy kept' : synced ? 'Synced to your Google Drive' : 'Waiting to sync') : 'Private to this device'}
          </p>
        </div>
        <Button disabled={!!localError} onClick={openNew} className="gradient-primary text-white rounded-btn h-11 gap-2">
          <Plus className="w-4 h-4" /> New
        </Button>
      </div>

      {syncError && <p role="alert" className="mb-4 text-sm text-destructive">{syncError} Tap the refresh button to retry.</p>}
      {hasLegacy && (
        <div className="mb-4 rounded-card border border-border p-4">
          <p className="text-sm mb-2">Previous entries are stored on this device. Import them only if they belong to you.</p>
          <Button variant="outline" onClick={importLegacy}>Import previous device entries</Button>
        </div>
      )}
      {localError && <p role="alert" className="mb-4 text-sm text-destructive">{localError}</p>}

      {/* Search + filter */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title or content..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          <button
            onClick={() => setMoodFilter('all')}
            className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold transition-colors ${
              moodFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground'
            }`}
          >
            All
          </button>
          {MOODS.map(m => (
            <button
              key={m.id}
              onClick={() => setMoodFilter(m.id)}
              className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold flex items-center gap-1 transition-colors ${
                moodFilter === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground'
              }`}
            >
              <span aria-hidden>{m.emoji}</span> {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-caption text-foreground">
            <Switch aria-label="Google Drive sync" disabled={!!localError || !driveAvailable} checked={cloudSync} onCheckedChange={toggleCloudSync} />
            <span className="flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" /> Google Drive sync
            </span>
            {cloudSync && (
              <button
                type="button"
                onClick={() => void sync(true)}
                className="ml-1 p-1 rounded-full hover:bg-secondary"
                aria-label="Refresh sync"
                disabled={syncing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </label>
          <Button
            onClick={() => exportPdf(entries)}
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={entries.length === 0}
          >
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      <p className="text-caption text-muted-foreground mb-4">
        {driveAvailable ? 'Connect your Google account to back up your diary in your own Google Drive.' : 'Google Drive sync is available in the installed HabTastic app.'}
        {' '}<a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" className="underline">Open Google Drive</a>
      </p>

      {filtered.length === 0 ? (
        <div className="glass rounded-card p-10 text-center shadow-card">
          <p className="text-5xl mb-3" aria-hidden="true">📓</p>
          <p className="font-semibold text-body-lg text-foreground">
            {entries.length === 0 ? 'Your diary is empty' : 'No matches'}
          </p>
          <p className="text-body text-muted-foreground mt-1 mb-5">
            {entries.length === 0
              ? 'Tap "New" to write your first entry.'
              : 'Try a different search or mood filter.'}
          </p>
          {entries.length === 0 && (
            <div className="flex justify-center">
              <Button onClick={openNew} className="gradient-primary text-white rounded-btn h-11 gap-2">
                <Plus className="w-4 h-4" /> New entry
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => {
            const m = moodOf(e.mood);
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openEdit(e); } }}
                onClick={() => openEdit(e)}
                className="w-full text-left glass rounded-card p-4 shadow-card hover:bg-secondary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-body text-foreground truncate flex items-center gap-2">
                    {m && <span aria-hidden>{m.emoji}</span>}
                    {e.title.trim() || 'Untitled entry'}
                  </p>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); remove(e.id); }}
                    className="p-1.5 rounded-btn text-destructive hover:bg-destructive/10 shrink-0"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-caption text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatEntryDate(e.entryAt)}
                </p>
                <p className="text-body text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                  {e.content}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {showEditor && editing && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <button
              onClick={closeEditor}
              aria-label="Close"
              className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="text-caption text-muted-foreground flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" /> {savedLabel}
            </p>
            <Button onClick={closeEditor} className="gradient-primary text-white rounded-btn h-10 gap-2">
              <Save className="w-4 h-4" /> Done
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <Input
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              placeholder="Title (optional)"
              maxLength={100}
              className="h-12 text-base font-semibold"
            />
            <div>
              <label className="text-caption text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Date & time
              </label>
              <Input
                type="datetime-local"
                value={editing.entryAt}
                onChange={e => setEditing({ ...editing, entryAt: e.target.value })}
                className="h-12"
              />
            </div>
            <div>
              <p className="text-caption text-muted-foreground mb-2">How did you feel?</p>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        mood: editing.mood === m.id ? undefined : m.id,
                      })
                    }
                    className={`px-3 h-9 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-colors ${
                      editing.mood === m.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground hover:bg-secondary/70'
                    }`}
                  >
                    <span aria-hidden>{m.emoji}</span> {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={editing.content}
              onChange={e => setEditing({ ...editing, content: e.target.value })}
              placeholder="Write whatever's on your mind..."
              className="min-h-[40vh] text-base leading-relaxed bg-secondary/40"
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}
