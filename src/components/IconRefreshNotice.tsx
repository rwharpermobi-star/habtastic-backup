import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * One-time notice for users who installed the PWA before the icon update.
 * iOS and Android cache home-screen icons forever — the only reliable way to
 * refresh is to remove the installed app and reinstall it.
 *
 * We bump ICON_VERSION whenever the icon set changes. Users who haven't yet
 * dismissed the notice for this version see a persistent toast.
 */
const ICON_VERSION = '3';
const STORAGE_KEY = 'habtastic:icon-refresh-ack';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari
  // @ts-expect-error - iOS-only property
  if (window.navigator.standalone === true) return true;
  // Android / desktop installed PWA
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return false;
}

export default function IconRefreshNotice() {
  useEffect(() => {
    if (!isStandalone()) return;
    const ack = localStorage.getItem(STORAGE_KEY);
    if (ack === ICON_VERSION) return;

    const id = setTimeout(() => {
      toast(
        '✨ New app icon available',
        {
          description:
            "We've updated the HabTastic icon. To see the new one on your home screen, please uninstall the app and reinstall it from your browser.",
          duration: Infinity,
          action: {
            label: 'Got it',
            onClick: () => {
              localStorage.setItem(STORAGE_KEY, ICON_VERSION);
            },
          },
          onDismiss: () => localStorage.setItem(STORAGE_KEY, ICON_VERSION),
          onAutoClose: () => localStorage.setItem(STORAGE_KEY, ICON_VERSION),
        }
      );
    }, 1500);

    return () => clearTimeout(id);
  }, []);

  return null;
}
