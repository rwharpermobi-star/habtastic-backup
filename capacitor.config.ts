import type { CapacitorConfig } from '@capacitor/cli';

// NOTE: Do NOT add a `server.url` pointing to lovableproject.com / preview domains
// for release builds — that causes "Lovable proxy error (404)" on installed APKs.
// Release APKs must load the bundled web assets from `webDir` (dist/).
// For local hot-reload during development, set CAP_SERVER_URL in your env before
// running `npx cap sync` (e.g. your LAN dev server or the Lovable sandbox URL).
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.lovable.habtastic',
  appName: 'HabTastic AI',
  webDir: 'dist',
  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: true } }
    : {}),
  // Native AdMob is enabled through the same explicit plugin allow-list as the
  // other production Capacitor integrations. The web layer remains fail-safe,
  // so a missing SDK/ad/no-fill cannot block the app.
  android: {
    includePlugins: [
      '@capacitor-community/admob',
      '@capacitor-community/speech-recognition',
      '@capacitor-firebase/authentication',
      '@capacitor-firebase/crashlytics',
      '@capacitor/app',
      '@capacitor/browser',
      '@capacitor/filesystem',
      '@capacitor/local-notifications',
      '@capacitor/preferences',
      '@capacitor/push-notifications',
      '@capacitor/share',
      '@capgo/native-purchases',
      'capacitor-native-settings',
    ],
  },
  plugins: {
    // Use native HTTP for fetch/XHR in the Android WebView. This avoids browser CORS
    // restrictions when the diary sync calls the Google Drive REST API.
    CapacitorHttp: {
      enabled: true,
    },
    // Native Google Sign-In: we only want the Google ID token so Supabase can
    // mint its own session — `skipNativeAuth` keeps Firebase Auth out of the
    // loop entirely (no Firebase user records are created).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
    PushNotifications: {
      // Show the notification (banner + badge + sound) even when the app is
      // in the foreground; Android shows tray notifications automatically.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_habtastic',
      iconColor: '#3B82F6',
    },
  },

};

export default config;
