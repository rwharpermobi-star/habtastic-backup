import { formatLocalDate, parseLocalDate } from '@/lib/habitStore';
import type jsPDF from 'jspdf';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  getDayStatus,
  getProgressBarColor,
  type HabitDayStatus,
} from './habitStatus';
import type { DbHabit } from '@/hooks/useHabits';
import { saveFile, type SavedFileResult } from './saveFile';

interface ReportInput {
  habits: DbHabit[];
  level: number;
  levelTitle: string;
  userName?: string;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (completions.includes(formatLocalDate(d))) {
      streak++;
      started = true;
    } else if (started || i > 0) break;
  }
  return streak;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/**
 * Generate a one-page A4 PDF of the user's weekly progress report,
 * including the colored status legend, week chart, day-status row and
 * habit breakdown. Returns nothing — triggers an immediate download.
 */
export async function generateWeeklyReportPdf({ habits, level, levelTitle, userName }: ReportInput): Promise<SavedFileResult> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28
  const margin = 40;
  const contentW = pageWidth - margin * 2;

  // ---- Compute report data (same logic as WeeklyReportCard) ----
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return formatLocalDate(d);
  });
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const dailyRates = last7.map((day) => {
    const completed = habits.filter((h) => h.completions.includes(day)).length;
    return {
      day,
      completed,
      total: habits.length,
      rate: habits.length > 0 ? Math.round((completed / habits.length) * 100) : 0,
      status: getDayStatus(day, completed, habits.length),
    };
  });

  const avgRate = Math.round(dailyRates.reduce((s, d) => s + d.rate, 0) / 7);
  const perfectDays = dailyRates.filter((d) => d.rate === 100).length;
  const totalCompleted = dailyRates.reduce((s, d) => s + d.completed, 0);
  const totalPossible = dailyRates.reduce((s, d) => s + d.total, 0);
  const bestStreak = habits.reduce((max, h) => Math.max(max, getStreak(h.completions)), 0);
  const activeDays = dailyRates.filter((d) => d.completed > 0).length;
  const growthScore = Math.min(
    100,
    Math.round(avgRate * 0.35 + perfectDays * 8 + bestStreak * 2.5 + activeDays * 3 + level * 2),
  );

  const habitStats = habits
    .map((h) => {
      const w = last7.filter((d) => h.completions.includes(d)).length;
      return { ...h, weekCompletions: w, weekRate: Math.round((w / 7) * 100) };
    })
    .sort((a, b) => b.weekRate - a.weekRate);

  // ---- Header ----
  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Weekly Progress Report', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  const subtitle = `${userName ? userName + ' · ' : ''}HabTastic · ${new Date().toLocaleDateString(
    undefined,
    { month: 'long', day: 'numeric', year: 'numeric' },
  )}`;
  doc.text(subtitle, margin, y);
  y += 24;

  // ---- Top stats grid (4 cards) ----
  const statBoxW = (contentW - 30) / 4;
  const statBoxH = 60;
  const stats = [
    { label: 'Growth Score', value: `${growthScore}/100`, color: getProgressBarColor(growthScore) },
    { label: 'Avg Completion', value: `${avgRate}%`, color: getProgressBarColor(avgRate) },
    { label: 'Perfect Days', value: `${perfectDays}d`, color: STATUS_COLORS.completed },
    { label: 'Best Streak', value: `${bestStreak}d`, color: STATUS_COLORS.partial },
  ];
  stats.forEach((s, i) => {
    const x = margin + i * (statBoxW + 10);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(x, y, statBoxW, statBoxH, 8, 8, 'F');
    // accent bar
    doc.setFillColor(...hexToRgb(s.color));
    doc.roundedRect(x, y, 4, statBoxH, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(s.value, x + 14, y + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(s.label, x + 14, y + 46);
  });
  y += statBoxH + 22;

  // ---- Level pill ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Level ${level} — ${levelTitle}`, margin, y);
  y += 22;

  // ---- Day status row ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('This Week', margin, y);
  y += 14;

  const cellW = contentW / 7;
  const circleR = 14;
  const rowY = y + circleR + 4;
  dailyRates.forEach((d, i) => {
    const cx = margin + cellW * i + cellW / 2;
    drawStatusCircle(doc, cx, rowY, circleR, d.status, d.rate);
    // weekday letter
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(dayLabels[parseLocalDate(d.day).getDay()], cx, rowY + circleR + 14, { align: 'center' });
    // % beneath
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${d.rate}%`, cx, rowY + circleR + 26, { align: 'center' });
  });
  y = rowY + circleR + 38;

  // ---- Legend ----
  drawLegend(doc, margin, y, contentW);
  y += 26;

  // ---- Weekly bar chart ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Weekly Completion', margin, y);
  y += 12;

  const chartH = 110;
  const chartTop = y;
  const chartBottom = y + chartH;
  // baseline
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, chartBottom, margin + contentW, chartBottom);

  const barAreaW = contentW / 7;
  const barW = barAreaW * 0.55;
  dailyRates.forEach((d, i) => {
    const cx = margin + barAreaW * i + barAreaW / 2;
    const bx = cx - barW / 2;
    const fillH = (d.rate / 100) * (chartH - 8);
    // bg track
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(bx, chartTop, barW, chartH, 4, 4, 'F');
    // fill
    if (fillH > 0) {
      doc.setFillColor(...hexToRgb(getProgressBarColor(d.rate)));
      doc.roundedRect(bx, chartBottom - fillH, barW, fillH, 4, 4, 'F');
    }
    // label under
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(dayLabels[parseLocalDate(d.day).getDay()], cx, chartBottom + 14, { align: 'center' });
  });
  y = chartBottom + 28;

  // ---- Habit breakdown ----
  if (habitStats.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('Habit Breakdown', margin, y);
    y += 14;

    const rowH = 18;
    const barTrackX = margin + 200;
    const barTrackW = contentW - 200 - 50;
    habitStats.slice(0, 12).forEach((h) => {
      if (y + rowH > 800) return; // safety: don't run off page
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      const name = `${h.emoji}  ${h.name}`;
      doc.text(name.length > 32 ? name.slice(0, 30) + '…' : name, margin, y + 12);

      // bar track
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(barTrackX, y + 5, barTrackW, 8, 4, 4, 'F');
      // fill
      const fw = (h.weekRate / 100) * barTrackW;
      if (fw > 0) {
        doc.setFillColor(...hexToRgb(getProgressBarColor(h.weekRate)));
        doc.roundedRect(barTrackX, y + 5, fw, 8, 4, 4, 'F');
      }
      // pct
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`${h.weekRate}%`, margin + contentW, y + 12, { align: 'right' });
      y += rowH;
    });
    y += 6;
  }

  // ---- Footer summary ----
  if (y < 760) {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, margin + contentW, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const summary = `You completed ${totalCompleted} of ${totalPossible} habit check-ins this week.${
      perfectDays > 0 ? `  ${perfectDays} perfect day${perfectDays > 1 ? 's' : ''}.` : ''
    }${bestStreak >= 7 ? `  Current best streak: ${bestStreak} days.` : ''}`;
    doc.text(summary, margin, y, { maxWidth: contentW });
  }

  const filename = `habtastic-weekly-report-${formatLocalDate(new Date())}.pdf`;
  return saveFile(doc.output('blob'), filename);
}

// ---------- helpers ----------

function drawStatusCircle(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  status: HabitDayStatus,
  rate: number,
) {
  if (status === 'completed') {
    doc.setFillColor(...hexToRgb(STATUS_COLORS.completed));
    doc.circle(cx, cy, r, 'F');
    // checkmark
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(2.2);
    doc.line(cx - 5, cy + 0.5, cx - 1.5, cy + 4);
    doc.line(cx - 1.5, cy + 4, cx + 5.5, cy - 3.5);
  } else if (status === 'missed') {
    doc.setFillColor(...hexToRgb(STATUS_COLORS.missed));
    doc.circle(cx, cy, r, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(2);
    doc.line(cx - 4, cy - 4, cx + 4, cy + 4);
    doc.line(cx + 4, cy - 4, cx - 4, cy + 4);
  } else if (status === 'partial') {
    // outline ring
    doc.setDrawColor(...hexToRgb(STATUS_COLORS.partial));
    doc.setLineWidth(1.5);
    doc.circle(cx, cy, r, 'S');
    // half-fill from bottom up, height proportional to rate
    const ratio = Math.max(0.15, Math.min(0.85, rate / 100));
    const fillH = r * 2 * ratio;
    const fillTop = cy + r - fillH;
    // simulate clipped fill: draw a filled rect, then redraw a thin outline
    // jsPDF lacks clip — we approximate by drawing many short horizontal lines
    // inside the circle. For radius r, x extent at y is sqrt(r^2 - (y-cy)^2).
    doc.setFillColor(...hexToRgb(STATUS_COLORS.partial));
    const step = 0.6;
    for (let yy = fillTop; yy <= cy + r; yy += step) {
      const dy = yy - cy;
      const halfW = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (halfW > 0) doc.rect(cx - halfW, yy, halfW * 2, step, 'F');
    }
    // redraw ring on top so the outline stays crisp
    doc.setDrawColor(...hexToRgb(STATUS_COLORS.partial));
    doc.setLineWidth(1.5);
    doc.circle(cx, cy, r, 'S');
  } else if (status === 'today') {
    doc.setDrawColor(...hexToRgb(STATUS_COLORS.today));
    doc.setLineWidth(2);
    doc.circle(cx, cy, r, 'S');
    doc.setFillColor(...hexToRgb(STATUS_COLORS.today));
    doc.circle(cx, cy, 2.5, 'F');
  } else {
    // future
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(1);
    doc.circle(cx, cy, r, 'S');
  }
}

function drawLegend(doc: jsPDF, x: number, y: number, w: number) {
  const entries: Array<{ key: keyof typeof STATUS_LABELS; kind: 'solid' | 'partial' | 'outline' }> = [
    { key: 'completed', kind: 'solid' },
    { key: 'partial', kind: 'partial' },
    { key: 'missed', kind: 'solid' },
    { key: 'today', kind: 'outline' },
  ];
  const itemW = w / entries.length;
  entries.forEach((e, i) => {
    const cx = x + itemW * i + 8;
    const color = STATUS_COLORS[e.key];
    if (e.kind === 'solid') {
      doc.setFillColor(...hexToRgb(color));
      doc.circle(cx, y, 4, 'F');
    } else if (e.kind === 'outline') {
      doc.setDrawColor(...hexToRgb(color));
      doc.setLineWidth(1.2);
      doc.circle(cx, y, 4, 'S');
    } else {
      // half-filled mini
      doc.setDrawColor(...hexToRgb(color));
      doc.setLineWidth(1);
      doc.circle(cx, y, 4, 'S');
      doc.setFillColor(...hexToRgb(color));
      const r = 4;
      const step = 0.4;
      for (let yy = y; yy <= y + r; yy += step) {
        const dy = yy - y;
        const halfW = Math.sqrt(Math.max(0, r * r - dy * dy));
        if (halfW > 0) doc.rect(cx - halfW, yy, halfW * 2, step, 'F');
      }
      doc.setDrawColor(...hexToRgb(color));
      doc.setLineWidth(1);
      doc.circle(cx, y, 4, 'S');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(STATUS_LABELS[e.key], cx + 10, y + 3);
  });
}
