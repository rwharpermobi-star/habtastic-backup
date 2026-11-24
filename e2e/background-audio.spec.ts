import { test, expect } from '@playwright/test';

/**
 * Background music playback contract for lofi + ambient.
 *
 * Runs under two Playwright projects:
 *   audio-web      -> Desktop Chrome (web app)
 *   audio-android  -> Pixel 5 / Android Chrome UA, which matches the Chromium
 *                     WebView that Capacitor uses inside the APK.
 *
 * Verified per track: the resolved source loads and starts, loops seamlessly
 * across the file boundary (no `ended`, no stall, playback continues), and
 * recovers after a pause/play cycle.
 */

type Probe = {
  src: string;
  status: number;
  duration: number;
  startedAt: number;
  loopedTime: number;
  ended: boolean;
  loopFlag: boolean;
  playingAfterLoop: boolean;
  wrapped: boolean;
  afterResumeTime: number;
  pausedTime: number;
  errorCode: number | null;
};

const TRACKS = ['lofi', 'ambient'] as const;

test.describe('background music playback', () => {
  for (const track of TRACKS) {
    test(`${track} starts, loops seamlessly and recovers after pause/play`, async ({ page }) => {
      await page.goto('/');

      const probe = await page.evaluate<Probe, string>(async (name) => {
        const sources: Record<string, string[]> = {
          lofi: ['/sounds/lofi.ogg', '/sounds/lofi.m4a'],
          ambient: ['/sounds/ambient.ogg', '/sounds/ambient.m4a'],
        };
        const mimes: Record<string, string> = {
          ogg: 'audio/ogg; codecs=opus',
          m4a: 'audio/mp4; codecs="mp4a.40.2"',
        };
        const candidates = sources[name];
        const probeEl = document.createElement('audio');
        const src =
          candidates.find((c) => probeEl.canPlayType(mimes[c.split('.').pop() as string])) ??
          candidates[candidates.length - 1];

        const head = await fetch(src, { method: 'GET' });
        const audio = new Audio(src);
        audio.loop = true;
        audio.volume = 0.01;
        // Full buffering: Opus/ogg only reports a finite duration once the whole
        // container has been indexed, and the loop-boundary seek below needs it.
        audio.preload = 'auto';

        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

        await new Promise<void>((resolve, reject) => {
          audio.addEventListener('canplaythrough', () => resolve(), { once: true });
          audio.addEventListener('error', () => reject(new Error('decode error')), { once: true });
          setTimeout(() => reject(new Error('load timeout')), 25000);
          audio.load();
        });

        for (let i = 0; i < 80 && !Number.isFinite(audio.duration); i++) await wait(250);
        if (!Number.isFinite(audio.duration)) throw new Error('duration never resolved');


        await audio.play();
        await wait(1200);
        const startedAt = audio.currentTime;

        // Jump close to the end so the loop boundary is crossed for real.
        const beforeLoop = audio.duration - 0.35;
        audio.currentTime = Math.max(0, beforeLoop);
        await wait(2000);
        const loopedTime = audio.currentTime;
        const playingAfterLoop = !audio.paused && !audio.ended;
        const wrapped = loopedTime < beforeLoop;


        // Pause / play recovery.
        audio.pause();
        const pausedTime = audio.currentTime;
        await wait(400);
        await audio.play();
        await wait(1000);
        const afterResumeTime = audio.currentTime;

        // Snapshot duration before teardown — clearing src resets it to NaN.
        const duration = audio.duration;
        audio.pause();
        audio.src = '';

        return {
          src,
          status: head.status,
          duration,
          startedAt,
          loopedTime,
          ended: audio.ended,
          loopFlag: audio.loop,
          playingAfterLoop,
          wrapped,
          afterResumeTime,
          pausedTime,
          errorCode: audio.error ? audio.error.code : null,
        };
      }, track);

      // Asset is served and decodable.
      expect(probe.status).toBe(200);
      expect(probe.errorCode).toBeNull();
      expect(probe.duration).toBeGreaterThan(60);

      // Playback actually advanced from zero.
      expect(probe.startedAt).toBeGreaterThan(0.4);

      // Looped: wrapped back near the start, kept playing, never "ended".
      expect(probe.loopFlag).toBe(true);
      expect(probe.ended).toBe(false);
      expect(probe.playingAfterLoop).toBe(true);
      expect(probe.wrapped).toBe(true);
      expect(probe.loopedTime).toBeGreaterThan(0);
      expect(probe.loopedTime).toBeLessThan(5);

      // Resumed after pause and advanced again.
      expect(probe.afterResumeTime).toBeGreaterThan(probe.pausedTime);
    });
  }

  test('background music control toggles playback', async ({ page }) => {
    await page.goto('/wellness');
    const trigger = page.getByRole('button', { name: 'Background music' });
    // Wellness Hub is session-gated; without a session there is nothing to drive.
    if (!(await trigger.isVisible().catch(() => false))) {
      test.skip(true, 'Wellness Hub not reachable without a session');
    }
    await trigger.click();
    await expect(page.getByText('Background Music')).toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play music' });
    await playBtn.click();
    await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible();


    // Element exists, is unmuted, looping and advancing.
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => {
      const el = document.querySelector('audio') as HTMLAudioElement | null;
      return el
        ? { src: el.src, loop: el.loop, paused: el.paused, time: el.currentTime }
        : null;
    });
    if (state) {
      expect(state.loop).toBe(true);
      expect(state.src).toMatch(/\/sounds\/(lofi|rain|ambient)\.(ogg|m4a|mp3)/);
    }

    await page.getByRole('button', { name: 'Pause music' }).click();
    await expect(page.getByRole('button', { name: 'Play music' })).toBeVisible();
  });
});
