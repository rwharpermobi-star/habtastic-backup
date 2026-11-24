/**
 * Native Firebase Crashlytics sink (Android/iOS only).
 *
 * Monitoring only: attaches to the existing centralized logger so anything
 * that already funnels through `logError` / `logWarn` (ErrorBoundary, global
 * window error + unhandledrejection handlers, network failures) also lands in
 * Crashlytics as a non-fatal event.
 *
 * Privacy rules (deliberately strict):
 * - Never sends raw context objects, response bodies, stacks with URLs,
 *   emails, JWTs/tokens, query strings or hashes.
 * - Only a scrubbed `[category] message` string plus the current pathname.
 * - No Crashlytics user ID is ever set.
 *
 * Safety rules:
 * - No-op on web (including the Lovable preview) — the dynamic import only
 *   happens after the native platform check.
 * - Every failure is swallowed; startup must never be blocked or crashed.
 */

import { Capacitor } from "@capacitor/core";
import { attachLogSink, type LogEvent } from "@/lib/logger";

const MAX_MESSAGE_LENGTH = 300;

/** Same shapes as the telemetry sink: strip anything identity-bearing. */
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/(access_token|refresh_token|id_token|token|code|otp|api[_-]?key)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
  [/https?:\/\/[^\s"']+/gi, "[url]"],
];

export function scrubMessage(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PII_PATTERNS) out = out.replace(pattern, replacement);
  if (out.length > MAX_MESSAGE_LENGTH) out = `${out.slice(0, MAX_MESSAGE_LENGTH)}…`;
  return out;
}

/** Pathname only — query string and hash are high-PII, low-value. */
function safePath(): string {
  try {
    return window.location.pathname.split("?")[0].split("#")[0];
  } catch {
    return "unknown";
  }
}

export function formatEvent(event: LogEvent): string {
  return scrubMessage(`[${event.category}] ${event.message} @${safePath()}`);
}

let started = false;

export function startCrashlyticsSink(): void {
  if (started) return;
  // Web / Lovable preview must be completely untouched.
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  started = true;

  void (async () => {
    try {
      const { FirebaseCrashlytics } = await import("@capacitor-firebase/crashlytics");

      await FirebaseCrashlytics.setEnabled({ enabled: true });

      attachLogSink((event) => {
        // Info-level noise is never forwarded.
        if (event.level === "info") return;
        const message = formatEvent(event);
        try {
          if (event.level === "error") {
            void FirebaseCrashlytics.recordException({ message }).catch(() => {});
          } else {
            void FirebaseCrashlytics.log({ message }).catch(() => {});
          }
        } catch {
          /* sink must never throw into the logger */
        }
      });
    } catch {
      /* plugin missing or native bridge unavailable — monitoring is optional */
    }
  })();
}
