import { useEffect, useState } from 'react';

interface LiveClockProps {
  className?: string;
  timeClassName?: string;
  dateClassName?: string;
}

const CLOCK_FORMAT_KEY = 'habtastic-clock-format'; // '12' | '24'
const CLOCK_FORMAT_EVENT = 'habtastic:clock-format-changed';

function readFormat(): '12' | '24' {
  if (typeof window === 'undefined') return '24';
  const v = window.localStorage.getItem(CLOCK_FORMAT_KEY);
  return v === '12' ? '12' : '24';
}

/**
 * Live local time + date in the user's detected timezone.
 * Format (12h/24h) is controlled via the Appearance setting and stored in
 * localStorage under `habtastic-clock-format`. Updates live when changed.
 */
export default function LiveClock({
  className,
  timeClassName,
  dateClassName,
}: LiveClockProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [format, setFormat] = useState<'12' | '24'>(readFormat);

  useEffect(() => {
    const align = 1000 - (Date.now() % 1000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, align);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const sync = () => setFormat(readFormat());
    window.addEventListener('storage', sync);
    window.addEventListener(CLOCK_FORMAT_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CLOCK_FORMAT_EVENT, sync);
    };
  }, []);

  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12',
    timeZone,
  }).format(now);

  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(now);

  return (
    <div
      aria-label={`Current time ${time}, ${date}`}
      className={
        'flex items-baseline gap-2 font-display font-semibold tabular-nums tracking-tight ' +
        (className ?? '')
      }
    >
      <time
        dateTime={now.toISOString()}
        className={'text-glow-primary ' + (timeClassName ?? '')}
      >
        {time}
      </time>
      <span
        className={
          'text-xs sm:text-sm font-medium text-glow-accent ' + (dateClassName ?? '')
        }
      >
        {date}
      </span>
    </div>
  );
}

export { CLOCK_FORMAT_KEY, CLOCK_FORMAT_EVENT };
