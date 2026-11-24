import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export function useConfetti() {
  const fire = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let confetti: typeof import('canvas-confetti').default | undefined;
    try {
      confetti = (await import('canvas-confetti')).default;
    } catch {
      // If the confetti library fails to load (e.g. stale Vite chunk after redeploy),
      // fail silently so celebrations never block the app or trigger unhandled rejections.
      return;
    }
    if (!confetti) return;

    // Android WebView is much more sensitive to canvas particle load than a
    // desktop browser. Keep the celebration, but use one short GPU-friendly
    // burst instead of four overlapping particle systems.
    if (Capacitor.isNativePlatform()) {
      confetti({
        particleCount: 36,
        spread: 62,
        origin: { y: 0.62 },
        colors: ['#4ADE80', '#FF7A00', '#FFD700', '#22D3EE', '#A78BFA'],
        gravity: 1,
        ticks: 100,
        scalar: 0.9,
        disableForReducedMotion: true,
      });
      return;
    }

    // First burst — center
    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4ADE80', '#FF7A00', '#FFD700', '#22D3EE', '#A78BFA'],
      gravity: 0.8,
      ticks: 180,
      disableForReducedMotion: true,
    });

    // Left burst
    window.setTimeout(() => {
      confetti({
        particleCount: 30,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors: ['#4ADE80', '#FF7A00', '#FFD700'],
        gravity: 0.9,
        ticks: 150,
        disableForReducedMotion: true,
      });
    }, 150);

    // Right burst
    window.setTimeout(() => {
      confetti({
        particleCount: 30,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors: ['#4ADE80', '#FF7A00', '#FFD700'],
        gravity: 0.9,
        ticks: 150,
        disableForReducedMotion: true,
      });
    }, 300);
  }, []);

  return { fireConfetti: fire };
}
