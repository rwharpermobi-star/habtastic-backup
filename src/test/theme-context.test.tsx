import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme, useSafeTheme, ThemeProvider } from '@/contexts/ThemeContext';

// Mock auth + profile hooks since ThemeProvider depends on them.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
}));

describe('ThemeContext safety', () => {
  it('useTheme throws a clear error when used outside ThemeProvider', () => {
    // Suppress expected console.error from React error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });

  it('useSafeTheme returns a fallback theme when no provider is mounted', () => {
    const { result } = renderHook(() => useSafeTheme());
    expect(result.current.theme).toMatch(/^(light|dark)$/);
    expect(typeof result.current.toggleTheme).toBe('function');
    expect(typeof result.current.setTheme).toBe('function');
    expect(result.current.glowEnabled).toBe(false);
  });

  it('useTheme works correctly when wrapped in ThemeProvider', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toMatch(/^(light|dark)$/);
  });
});
