/**
 * End-to-end integration test for the Coach (Winston) page loading flow.
 *
 * Purpose:
 *   1. Verify that when profile/chat is still loading, Coach renders the
 *      <CoachSkeleton /> placeholder (and NOT the chat UI).
 *   2. Verify that once both `profile` and `chatLoaded` are ready, Coach
 *      transitions to the real chat UI without throwing.
 *   3. Guard against the historical regression where the early-return
 *      guard was placed above a `useCallback`, causing
 *      "Rendered more hooks than during the previous render" on the
 *      loading→loaded transition.
 *
 * Strategy:
 *   We mock every heavy dependency Coach imports (hooks, child components,
 *   router) so the test stays focused on the loading lifecycle. We toggle
 *   the mocked `useProfile` / `useCoachChat` return values between renders
 *   and assert the DOM transitions correctly with no console errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Coach's subtree reads shared data (progression, profile) through React Query,
// so the test needs a provider alongside the router.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

const withRouter = (ui: ReactNode) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
);

// ─── Mocks ────────────────────────────────────────────────────────────────
// We control these per-test via the exposed mock fns.
const mockUseProfile = vi.fn();
const mockUseCoachChat = vi.fn();

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => mockUseCoachChat(),
}));

// Stub all other hooks Coach pulls in so they don't try to hit Supabase or
// touch unavailable browser APIs during the test.
vi.mock('@/hooks/useHabits', () => ({
  useHabits: () => ({ habits: [] }),
}));
vi.mock('@/hooks/useChallenges', () => ({
  useChallenges: () => ({ challenges: [], isActive: () => false }),
}));
vi.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    canUseAI: () => true,
    canAccess: () => true,
    aiMessagesLeft: () => 5,
    trackAIMessage: vi.fn(),
    isPremium: true,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'test-token' }, user: { id: 'u1' } }),
}));
vi.mock('@/hooks/useGoals', () => ({
  useGoals: () => ({ activeGoals: [] }),
}));
vi.mock('@/hooks/useWinstonVoice', () => ({
  useWinstonVoice: () => ({
    state: 'idle' as const,
    speak: vi.fn().mockResolvedValue(undefined),
    interrupt: vi.fn(),
    startListening: vi.fn().mockResolvedValue(null),
    stopListening: vi.fn(),
    setState: vi.fn(),
  }),
}));
vi.mock('@/hooks/useWinstonChallenges', () => ({
  useWinstonChallenges: () => ({
    active: null,
    generating: false,
    generate: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    complete: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDailyChallenge', () => ({
  useDailyChallenge: () => ({
    hydrated: true,
    status: 'completed',
    template: { type: 'daily', description: '' },
  }),
}));

// Lightweight stand-ins for child components that aren't part of this test's
// concern. They render predictable text so we can assert the chat UI mounted.
vi.mock('@/components/WinstonChallengeCard', () => ({
  default: () => <div data-testid="winston-challenge-card" />,
}));
vi.mock('@/components/DailyChallengeCard', () => ({
  default: () => <div data-testid="daily-challenge-card" />,
}));
vi.mock('@/components/ChallengeStreakBadge', () => ({
  default: () => <div data-testid="challenge-streak-badge" />,
}));
vi.mock('@/components/Paywall', () => ({ default: () => null }));
vi.mock('@/components/LockedFeatureCard', () => ({ default: () => null }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// react-router-dom: provide a stub useNavigate so we don't need a Router.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Sonner toast — no-op
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────
function loadingProfile() {
  return { profile: null, loading: true, updateProfile: vi.fn() };
}
function readyProfile() {
  return {
    profile: {
      name: 'Hero',
      coach_gender: null,
      xp: 0,
      theme: 'light',
      onboarding_complete: true,
      avatar_url: null,
      is_premium: true,
      premium_until: null,
      daily_ai_messages: 0,
      last_ai_reset: null,
      streak_freezes: 0,
      freeze_used_dates: [],
      coins: 0,
      gems: 0,
      unlocked_themes: [],
      unlocked_effects: [],
      ai_avatar_credits_used: 0,
      ai_avatar_credits_reset_at: new Date().toISOString(),
    },
    loading: false,
    updateProfile: vi.fn(),
  };
}
function loadingChat() {
  return {
    activeCoach: 'winston' as const,
    messages: [],
    setMessages: vi.fn(),
    addMessage: vi.fn(),
    updateLastAssistant: vi.fn(),
    clearHistory: vi.fn(),
    loaded: false,
  };
}
function readyChat() {
  return { ...loadingChat(), loaded: true };
}

// ─── Tests ────────────────────────────────────────────────────────────────
describe('Coach page — loading → chat transition', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Stub navigator.vibrate (jsdom doesn't implement it)
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(),
    });
    // jsdom doesn't implement Element.prototype.scrollIntoView
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    } else {
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('shows the skeleton while profile is loading, then transitions to chat without crashing', async () => {
    // Start in loading state: profile loading + chat not yet loaded
    mockUseProfile.mockReturnValue(loadingProfile());
    mockUseCoachChat.mockReturnValue(loadingChat());

    const { default: Coach } = await import('@/pages/Coach');

    const { rerender, container } = render(withRouter(<Coach />));

    // ── Phase 1: skeleton visible, chat UI absent ─────────────────────────
    // CoachSkeleton uses <Skeleton /> elements with the "animate-pulse" class.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /winston/i })).toBeNull();

    // ── Phase 2: profile arrives but chat still loading → still skeleton ─
    mockUseProfile.mockReturnValue(readyProfile());
    mockUseCoachChat.mockReturnValue(loadingChat());
    rerender(withRouter(<Coach />));
    expect(screen.queryByRole('heading', { name: /winston/i })).toBeNull();

    // ── Phase 3: both ready → real chat UI renders, no crash ─────────────
    mockUseProfile.mockReturnValue(readyProfile());
    mockUseCoachChat.mockReturnValue(readyChat());
    rerender(withRouter(<Coach />));

    // The real Coach UI exposes an h1 "Winston" + the current status subline.
    expect(screen.getByRole('heading', { name: /winston/i })).toBeInTheDocument();
    expect(screen.getByText(/ready to help/i)).toBeInTheDocument();
    // Mocked child components mount, confirming we're past the early return.
    expect(screen.getByTestId('daily-challenge-card')).toBeInTheDocument();
    expect(screen.getByTestId('winston-challenge-card')).toBeInTheDocument();

    // ── Invariant: no React hook-order / invariant warnings were logged ──
    const reactHookErrors = consoleErrorSpy.mock.calls.filter((args) => {
      const msg = String(args[0] ?? '');
      return (
        msg.includes('Rendered more hooks') ||
        msg.includes('Rendered fewer hooks') ||
        msg.includes('change in the order of Hooks') ||
        msg.includes('Invalid hook call')
      );
    });
    expect(reactHookErrors).toHaveLength(0);
  });

  it('handles loading → loaded transition idempotently across multiple rerenders', async () => {
    mockUseProfile.mockReturnValue(loadingProfile());
    mockUseCoachChat.mockReturnValue(loadingChat());

    const { default: Coach } = await import('@/pages/Coach');
    const { rerender } = render(withRouter(<Coach />));

    // Toggle loading → loaded → loading → loaded to stress the hook order.
    for (const ready of [true, false, true]) {
      mockUseProfile.mockReturnValue(ready ? readyProfile() : loadingProfile());
      mockUseCoachChat.mockReturnValue(ready ? readyChat() : loadingChat());
      expect(() => rerender(withRouter(<Coach />))).not.toThrow();
    }

    // Final state should be the real chat UI.
    expect(screen.getByRole('heading', { name: /winston/i })).toBeInTheDocument();

    const reactHookErrors = consoleErrorSpy.mock.calls.filter((args) =>
      String(args[0] ?? '').match(/hooks|Invalid hook/i),
    );
    expect(reactHookErrors).toHaveLength(0);
  });
});
