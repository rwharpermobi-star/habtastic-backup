import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSupabase } from '@/integrations/supabase/lazyClient';
import { useAuth } from './AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { usePremium } from '@/hooks/usePremium';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  glowEnabled: boolean;
  setGlowEnabled: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const GLOW_KEY = 'habtastic_glow_enabled';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('habithero_theme');
    return (saved === 'dark' ? 'dark' : 'light') as Theme;
  });
  const [glowEnabled, setGlowEnabledState] = useState<boolean>(() => {
    return localStorage.getItem(GLOW_KEY) === 'true';
  });
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isPremium } = usePremium();

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('habithero_theme', theme);
  }, [theme]);

  useEffect(() => {
    // Keep the user's Premium theme preference, but only apply the visual
    // effect while Premium/trial access is active. Re-subscribing restores it
    // automatically without making the user configure it again.
    document.documentElement.classList.toggle('glow', glowEnabled && isPremium);
    localStorage.setItem(GLOW_KEY, String(glowEnabled));
  }, [glowEnabled, isPremium]);

  // Sync theme from cached profile (no extra fetch)
  useEffect(() => {
    if (profile?.theme && profile.theme !== theme) {
      setThemeState(profile.theme as Theme);
    }
  }, [profile?.theme]);

  const persistTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    if (user) {
      await (await getSupabase()).from('profiles').update({ theme: newTheme }).eq('user_id', user.id);
    }
  };

  const toggleTheme = () => persistTheme(theme === 'dark' ? 'light' : 'dark');
  const setTheme = (t: Theme) => persistTheme(t);

  const setGlowEnabled = (v: boolean) => setGlowEnabledState(v);

  const effectiveGlowEnabled = glowEnabled && isPremium;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, glowEnabled: effectiveGlowEnabled, setGlowEnabled }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      'useTheme must be used within <ThemeProvider>. ' +
      'Check that the calling component is rendered as a descendant of ThemeProvider in App.tsx. ' +
      'For components mounted outside the provider (e.g. global Toaster), use useSafeTheme() instead.'
    );
  }
  return ctx;
}

/**
 * Safe variant of useTheme — returns a sensible default instead of throwing
 * when no ThemeProvider is mounted above. Use this for components that may
 * render outside the provider tree (global toasters, error boundaries, etc.).
 *
 * Falls back to reading the current `<html>` class for first-render consistency,
 * defaulting to 'light' to match the app's default theme.
 */
export function useSafeTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;

  const fallbackTheme: Theme =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';

  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[useSafeTheme] No ThemeProvider found — using fallback theme:', fallbackTheme);
  }

  return {
    theme: fallbackTheme,
    toggleTheme: () => {},
    setTheme: () => {},
    glowEnabled: false,
    setGlowEnabled: () => {},
  };
}
