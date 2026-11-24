/**
 * Centralized client-side logger.
 *
 * - All app errors funnel through `logError` so we have a single audit point.
 * - Events are buffered in-memory + persisted to localStorage (capped) so
 *   support can ask users to copy/export recent logs.
 * - Pluggable sink: anything attached via `attachLogSink` (e.g. a future
 *   Supabase edge function or Sentry) receives every event.
 *
 * No PII beyond what the caller chooses to log. Stack traces are kept short.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogCategory =
  | "render"
  | "payment"
  | "edge_function"
  | "supabase"
  | "navigation"
  | "network"
  | "unhandled"
  | "app";

export interface LogEvent {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

const STORAGE_KEY = "habtastic:logs";
const MAX_EVENTS = 100;
const sinks: Array<(e: LogEvent) => void> = [];

function persist(events: LogEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    /* storage full / private mode */
  }
}

function readStored(): LogEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let buffer: LogEvent[] = readStored();

function emit(event: LogEvent) {
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer = buffer.slice(-MAX_EVENTS);
  persist(buffer);
  for (const sink of sinks) {
    try { sink(event); } catch { /* sink must never crash logger */ }
  }
  const fn = event.level === "error" ? console.error : event.level === "warn" ? console.warn : console.log;
  fn(`[${event.category}] ${event.message}`, event.context ?? "");
}

function shortStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) {
    return err.stack.split("\n").slice(0, 6).join("\n");
  }
  return undefined;
}

export function logInfo(category: LogCategory, message: string, context?: Record<string, unknown>) {
  emit({ ts: new Date().toISOString(), level: "info", category, message, context });
}

export function logWarn(category: LogCategory, message: string, context?: Record<string, unknown>) {
  emit({ ts: new Date().toISOString(), level: "warn", category, message, context });
}

export function logError(
  category: LogCategory,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) {
  emit({
    ts: new Date().toISOString(),
    level: "error",
    category,
    message,
    context: { ...context, error: error instanceof Error ? error.message : error },
    stack: shortStack(error),
  });
}

export function attachLogSink(sink: (e: LogEvent) => void) {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

export function getRecentLogs(limit = MAX_EVENTS): LogEvent[] {
  return buffer.slice(-limit);
}

export function clearLogs() {
  buffer = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
