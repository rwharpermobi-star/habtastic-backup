# Restore Winston Voice on Android

## Scope
Fix Winston speech input/output and visible AI service errors only. Preserve unrelated app behavior and existing voice preferences.

## Work
- Add the Capacitor Community speech-recognition plugin; request microphone permission on native Android and keep Web Speech recognition in browsers.
- Surface native recognition partial/final results through the existing push-to-talk flow, and ensure release/interrupt cleanup.
- Show a user-actionable “Tap to hear Winston” control when audio playback is blocked.
- Display clear chat messages for AI/voice HTTP 402 and 429 responses.
- Set Android WebView playback to not require a gesture; keep the microphone manifest declaration.
- Inspect function logs and secret configuration, verify `server.url`, run focused checks, and commit the scoped changes.

## Technical details
Use the Capacitor 8-compatible `@capacitor-community/speech-recognition` API, existing semantic Button component, and `BridgeActivity` WebView configuration. Do not modify ElevenLabs keys, credit accounting, AI quota behavior, or unrelated services.
