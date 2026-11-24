# Fix Android auth persistence (native storage for Supabase session)

## Problem

On the Play internal-testing build the session is written to WebView `localStorage`. That store can be cleared by Android (WebView data eviction, storage partitioning, low-storage cleanup), so after fully closing and reopening the app the session is gone and the user lands back on `/auth`.

## Fix

Give Supabase auth a real native key/value store on Android (Capacitor `Preferences`, backed by Android `SharedPreferences`), and keep the existing brokered-preview/localStorage adapter untouched for web and Lovable preview.

Storage selection at client creation:

```text
native platform (Capacitor Android/iOS)  -> Preferences-backed async adapter
Lovable preview inside editor iframe     -> brokeredPreviewStorage()  (unchanged)
plain web                                -> localStorage              (unchanged)
```

`persistSession: true` and `autoRefreshToken: true` stay as they are.

## What changes

1. **New dependency**: `@capacitor/preferences` (Capacitor 8 line, matching the other plugins).

2. **New file `src/integrations/supabase/nativeAuthStorage.ts`**
   - Exports `isNativeApp()` (uses `Capacitor.isNativePlatform()`, safe on web) and `nativeAuthStorage()`.
   - Adapter implements the Supabase async storage contract: `getItem`, `setItem`, `removeItem`, all returning promises and delegating to `Preferences` under a `supabase.auth.` key prefix.
   - One-time migration on first `getItem`: if the key is absent in Preferences but present in `localStorage` (existing installed builds), copy it into Preferences before returning, so users who already logged in are not signed out by this change.
   - Every call wrapped so a plugin failure falls back to `localStorage` instead of throwing during auth boot.

3. **`src/integrations/supabase/client.ts`**
   - `storage:` becomes `isNativeApp() ? nativeAuthStorage() : brokeredPreviewStorage()`.
   - No other option changes; project URL, keys, custom fetch untouched.

4. **`src/contexts/AuthContext.tsx`** (small, startup-only)
   - Because native storage reads are async, boot must not conclude "signed out" before restore completes. The existing flow already awaits `getSession()` before setting state, so the only adjustment is: on native, do not sign the user out when `getUser()` fails for any non-explicit reason (today only network-ish messages are excused) — treat the cached, restored session as valid and let `autoRefreshToken` / the auth listener correct it. Boot timeout stays as a safety net.

5. **Tests** — new `src/integrations/supabase/__tests__/nativeAuthStorage.test.ts`
   - `setItem` then a fresh adapter instance (simulating app relaunch / client recreation) returns the same value.
   - `removeItem` clears it and a new instance returns `null`.
   - Values survive a wiped `localStorage` (proves persistence is native, not browser).
   - Migration test: value only in `localStorage` is picked up and then served from Preferences.
   - Plugin-throws test: adapter falls back to `localStorage` rather than rejecting.
   - Capacitor `Preferences` is mocked with an in-memory map that persists across adapter instances.

## Explicitly not touched

Google OAuth / Firebase sign-in logic, Supabase project or RLS, user accounts, Premium/Paystack, any other production logic. No AAB build, no publish.

## Verification

`tsgo` typecheck plus the full vitest suite, then a summary listing exactly which files changed.
