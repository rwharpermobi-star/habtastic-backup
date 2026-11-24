import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN', flag: '🇬🇧' },
  { code: 'es', label: 'Español', short: 'ES', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', short: 'FR', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', short: 'PT', flag: '🇵🇹' },
  { code: 'ar', label: 'العربية', short: 'AR', flag: '🇸🇦' },
  { code: 'arz', label: 'العربية المصرية', short: 'AR-EG', flag: '🇪🇬' },
  { code: 'hi', label: 'हिन्दी', short: 'HI', flag: '🇮🇳' },
  { code: 'zh', label: '中文', short: 'ZH', flag: '🇨🇳' },
  { code: 'zu', label: 'isiZulu', short: 'ZU', flag: '🇿🇦' },
  { code: 'af', label: 'Afrikaans', short: 'AF', flag: '🇿🇦' },
  { code: 'sw', label: 'Kiswahili', short: 'SW', flag: '🇰🇪' },
  { code: 'xh', label: 'isiXhosa', short: 'XH', flag: '🇿🇦' },
  { code: 'yo', label: 'Yorùbá', short: 'YO', flag: '🇳🇬' },
  { code: 'ha', label: 'Hausa', short: 'HA', flag: '🇳🇬' },
  { code: 'ta', label: 'தமிழ்', short: 'TA', flag: '🇮🇳' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

// Map of code -> dynamic loader. Vite splits each JSON into its own chunk so
// only the active locale is fetched. English is bundled eagerly so first
// render never blocks on the network.
const LOCALE_LOADERS: Partial<Record<Exclude<LanguageCode, 'en'>, () => Promise<{ default: any }>>> = {
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  pt: () => import('./locales/pt.json'),
  ar: () => import('./locales/ar.json'),
  hi: () => import('./locales/hi.json'),
  zh: () => import('./locales/zh.json'),
  zu: () => import('./locales/zu.json'),
  af: () => import('./locales/af.json'),
};

const loaded = new Set<string>(['en']);

export async function ensureLocale(code: string): Promise<void> {
  if (loaded.has(code)) return;
  const loader = (LOCALE_LOADERS)[code];
  if (!loader) return;
  try {
    const mod = await loader();
    i18n.addResourceBundle(code, 'translation', mod.default, true, true);
    loaded.add(code);
  } catch (e) {
    console.warn(`[i18n] failed to load locale ${code}`, e);
  }
}

const LANG_STORAGE_KEY = 'habtastic-lang';
const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map(l => l.code) as readonly string[];

/**
 * Tiny replacement for `i18next-browser-languagedetector` (~14 kB of eager
 * startup JS for two lookups). Reads the persisted choice first, then the
 * browser locale, and falls back to English.
 */
function detectLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && SUPPORTED_CODES.includes(stored.split('-')[0])) return stored.split('-')[0];
  } catch { /* private mode / storage disabled */ }
  const nav = (navigator.languages?.[0] || navigator.language || 'en').split('-')[0];
  return SUPPORTED_CODES.includes(nav) ? nav : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: detectLanguage(),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),
    interpolation: { escapeValue: false },
    returnNull: false,
  });

// Load detected non-English locale on startup; switch language once ready.
const detected = i18n.language?.split('-')[0];
if (detected && detected !== 'en') {
  ensureLocale(detected).then(() => {
    if (i18n.language?.split('-')[0] === detected) {
      i18n.changeLanguage(detected);
    }
  });
}

// Hook into language changes to fetch the locale on demand.
i18n.on('languageChanged', (lng) => {
  const base = lng?.split('-')[0];
  // Persist the choice ourselves now that the detector plugin is gone.
  try { if (base) localStorage.setItem(LANG_STORAGE_KEY, base); } catch { /* ignore */ }
  if (base && base !== 'en' && !loaded.has(base)) {
    ensureLocale(base);
  }
});

export default i18n;
