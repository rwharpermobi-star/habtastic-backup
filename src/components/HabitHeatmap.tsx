import { formatLocalDate, parseLocalDate } from '@/lib/habitStore';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, CheckCircle2, XCircle } from 'lucide-react';

type Habit = {
  id: string;
  name: string;
  emoji: string;
  completions: string[];
};

type Props = {
  habits: Habit[];
  /** Number of days to show (default 365 for yearly, 30 for monthly mini) */
  days?: number;
  /** Compact mini variant for the home screen */
  compact?: boolean;
  title?: string;
};

const CACHE_KEY = 'habit_heatmap_cache_v1';

function dateStr(d: Date): string {
  return formatLocalDate(d);
}

function buildDays(count: number): string[] {
  const arr: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    arr.push(dateStr(d));
  }
  return arr;
}

function getLevel(rate: number, completedCount: number): 0 | 1 | 2 | 3 | 4 {
  if (completedCount === 0) return 0;
  if (rate < 34) return 1;
  if (rate < 67) return 2;
  if (rate < 100) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<number, string> = {
  0: 'bg-secondary/60',
  1: 'bg-primary/20',
  2: 'bg-primary/45',
  3: 'bg-primary/75',
  4: 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]',
};

export default function HabitHeatmap({
  habits,
  days = 364,
  compact = false,
  title = 'Consistency Heatmap',
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const dayList = useMemo(() => buildDays(days), [days]);

  const cellsData = useMemo(() => {
    const total = habits.length;
    const data = dayList.map((day) => {
      const completedHabits = habits.filter((h) => h.completions.includes(day));
      const completed = completedHabits.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        day,
        completed,
        total,
        rate,
        level: getLevel(rate, completed),
        completedHabits,
      };
    });
    // local cache (best effort)
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), days, summary: data.map((d) => [d.day, d.level]) })
      );
    } catch { /* ignore: best effort */ }
    return data;
  }, [dayList, habits, days]);

  const selectedData = selected ? cellsData.find((c) => c.day === selected) : null;
  const missedHabits = selectedData
    ? habits.filter((h) => !h.completions.includes(selectedData.day))
    : [];

  // Group days into weeks (columns)
  const weeks = useMemo(() => {
    const cols: typeof cellsData[] = [];
    // Pad start so each column has 7 rows aligned by weekday (Sun=0)
    const firstDow = parseLocalDate(cellsData[0].day).getDay();
    const padded: (typeof cellsData[number] | null)[] = [
      ...Array(firstDow).fill(null),
      ...cellsData,
    ];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }
    return cols;
  }, [cellsData]);

  const cellSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const gap = compact ? 'gap-[3px]' : 'gap-1';

  return (
    <>
      <div className="glass rounded-card p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" strokeWidth={1.8} />
            <h3 className="font-semibold text-body-lg">{title}</h3>
          </div>
          {!compact && (
            <span className="text-caption text-muted-foreground">{days}d</span>
          )}
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          <div className={`flex ${gap}`}>
            {weeks.map((col, ci) => (
              <div key={ci} className={`flex flex-col ${gap}`}>
                {col.map((cell, ri) => {
                  if (!cell) {
                    return <div key={ri} className={`${cellSize} rounded-[3px] opacity-0`} />;
                  }
                  return (
                    <motion.button
                      key={cell.day}
                      type="button"
                      onClick={() => setSelected(cell.day)}
                      whileHover={{ scale: 1.4 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className={`${cellSize} rounded-[3px] ${LEVEL_CLASSES[cell.level]} transition-colors`}
                      aria-label={`${cell.day}: ${cell.completed}/${cell.total} habits`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 mt-3">
          <span className="text-caption text-muted-foreground mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <div key={lvl} className={`w-2.5 h-2.5 rounded-[3px] ${LEVEL_CLASSES[lvl]}`} />
          ))}
          <span className="text-caption text-muted-foreground ml-1">More</span>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedData
                ? parseLocalDate(selectedData.day).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })
                : ''}
            </DialogTitle>
          </DialogHeader>
          <AnimatePresence>
            {selectedData && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-caption text-muted-foreground">Completion</p>
                    <p className="font-bold text-h3">{selectedData.rate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-muted-foreground">Habits</p>
                    <p className="font-bold text-h3">
                      {selectedData.completed}/{selectedData.total}
                    </p>
                  </div>
                </div>

                {selectedData.completedHabits.length > 0 && (
                  <div>
                    <p className="text-caption font-semibold text-muted-foreground mb-2">
                      Completed
                    </p>
                    <div className="space-y-1.5">
                      {selectedData.completedHabits.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-primary/10"
                        >
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                          <span className="text-lg">{h.emoji}</span>
                          <span className="text-body font-medium">{h.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {missedHabits.length > 0 && (
                  <div>
                    <p className="text-caption font-semibold text-muted-foreground mb-2">
                      Missed
                    </p>
                    <div className="space-y-1.5">
                      {missedHabits.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-secondary/60"
                        >
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                          <span className="text-lg opacity-70">{h.emoji}</span>
                          <span className="text-body text-muted-foreground">{h.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedData.total === 0 && (
                  <p className="text-body text-muted-foreground text-center py-4">
                    No habits tracked on this day.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
