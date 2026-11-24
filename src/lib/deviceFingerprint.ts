import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cached: string | null = null;
let loadingPromise: Promise<string | null> | null = null;

/**
 * Returns a stable per-browser fingerprint. Cached for the session.
 * Used to detect duplicate-device referral fraud. NEVER used as the
 * only fraud signal — risk score requires ≥2 signal types to block.
 */
export async function getDeviceFingerprint(): Promise<string | null> {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      cached = result.visitorId;
      return cached;
    } catch (err) {
      console.warn('[fingerprint] failed:', err);
      return null;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}
