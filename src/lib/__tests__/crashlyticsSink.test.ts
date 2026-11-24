import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const importSpy = vi.fn();
vi.mock("@capacitor-firebase/crashlytics", () => {
  importSpy();
  return { FirebaseCrashlytics: {} };
});

import { formatEvent, scrubMessage, startCrashlyticsSink } from "@/lib/crashlyticsSink";
import type { LogEvent } from "@/lib/logger";

describe("crashlyticsSink", () => {
  it("is a no-op on web and never loads the native plugin", () => {
    expect(() => startCrashlyticsSink()).not.toThrow();
    expect(importSpy).not.toHaveBeenCalled();
  });

  it("scrubs emails, tokens and URLs from messages", () => {
    const scrubbed = scrubMessage(
      'fail user@test.com token=abc123 https://x.supabase.co/rest/v1/profiles?id=1',
    );
    expect(scrubbed).not.toContain("user@test.com");
    expect(scrubbed).not.toContain("abc123");
    expect(scrubbed).not.toContain("supabase.co");
  });

  it("caps message length", () => {
    expect(scrubMessage("a".repeat(1000)).length).toBeLessThanOrEqual(301);
  });

  it("formats events without query string or hash", () => {
    window.history.replaceState({}, "", "/pricing?token=secret#access_token=zzz");
    const event: LogEvent = {
      ts: new Date().toISOString(),
      level: "error",
      category: "render",
      message: "boom",
    };
    const formatted = formatEvent(event);
    expect(formatted).toContain("[render] boom @/pricing");
    expect(formatted).not.toContain("secret");
    expect(formatted).not.toContain("zzz");
  });
});
