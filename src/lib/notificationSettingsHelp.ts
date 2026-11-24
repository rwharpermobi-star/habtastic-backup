// Platform-aware help for opening notification permission settings.
// Browsers don't allow programmatic navigation to internal pages
// (chrome://, edge://, about:), so we expose a URL to copy + steps.

export interface SettingsHelp {
  platform: string;
  settingsUrl?: string;   // URL the user can paste into the address bar
  appSettings?: boolean;  // true when the user must open native OS settings
  steps: string[];
}

function detectBrowser(ua: string) {
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari';
  return 'other';
}

export function getNotificationSettingsHelp(): SettingsHelp {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);
  const browser = detectBrowser(ua);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (isIOS) {
    if (!isStandalone) {
      return {
        platform: 'iOS Safari',
        appSettings: true,
        steps: [
          'Tap the Share icon in Safari',
          'Choose "Add to Home Screen"',
          'Open HabTastic from your Home Screen',
          'Return to this page and tap Enable',
        ],
      };
    }
    return {
      platform: 'iPhone (installed app)',
      appSettings: true,
      steps: [
        'Open the iPhone Settings app',
        'Tap Notifications',
        'Find HabTastic in the list',
        'Turn on "Allow Notifications"',
        'Return here and tap Re-register',
      ],
    };
  }

  if (isAndroid) {
    return {
      platform: 'Android',
      settingsUrl: `chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`,
      steps: [
        'Tap the lock / tune icon next to the address bar',
        'Tap "Permissions" or "Site settings"',
        'Set Notifications to Allow',
        'Reload the page, then tap Re-register',
      ],
    };
  }

  if (browser === 'chrome') {
    return {
      platform: 'Chrome',
      settingsUrl: `chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`,
      steps: [
        'Click the lock icon in the address bar',
        'Open Site settings',
        'Set Notifications to Allow',
        'Reload this page, then click Re-register',
      ],
    };
  }

  if (browser === 'edge') {
    return {
      platform: 'Edge',
      settingsUrl: `edge://settings/content/siteDetails?site=${encodeURIComponent(origin)}`,
      steps: [
        'Click the lock icon in the address bar',
        'Open Permissions for this site',
        'Set Notifications to Allow',
        'Reload this page, then click Re-register',
      ],
    };
  }

  if (browser === 'firefox') {
    return {
      platform: 'Firefox',
      settingsUrl: 'about:preferences#privacy',
      steps: [
        'Click the lock icon in the address bar',
        'Click "Clear permission" next to "Send Notifications"',
        'Reload this page and click Enable to be prompted again',
      ],
    };
  }

  if (browser === 'safari') {
    return {
      platform: 'macOS Safari',
      appSettings: true,
      steps: [
        'Open Safari → Settings → Websites → Notifications',
        'Find this site and set it to Allow',
        'Reload this page, then click Re-register',
      ],
    };
  }

  return {
    platform: 'your browser',
    steps: [
      'Open your browser site settings for this page',
      'Set Notifications to Allow',
      'Reload this page and try again',
    ],
  };
}

export async function copySettingsUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
