import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionStatus from '@/pages/SubscriptionStatus';

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  invoke: vi.fn(),
  from: vi.fn(),
  play: {
    isPlay: false,
    prices: {} as Record<string, { priceString: string }>,
    restore: vi.fn(),
    manage: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'review-test-user' } }),
}));
vi.mock('@/hooks/useGooglePlayBilling', () => ({ useGooglePlayBilling: () => mocks.play }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function subscription(provider: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'subscription-1', provider, status: 'active', plan_interval: 'monthly',
    amount: provider === 'google_play' ? 49 : 4900, currency: 'ZAR',
    current_period_start: '2026-10-01T00:00:00Z',
    current_period_end: '2026-11-01T00:00:00Z',
    next_payment_date: '2026-11-01T00:00:00Z',
    cancel_at_period_end: false, canceled_at: null, environment: 'live',
    ...overrides,
  };
}

describe('Subscription settings billing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.row = null;
    mocks.play.isPlay = false;
    mocks.play.prices = {};
    mocks.play.restore.mockResolvedValue(true);
    mocks.play.manage.mockResolvedValue(undefined);
    mocks.invoke.mockResolvedValue({ data: { premium: true }, error: null });
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: mocks.row, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === 'subscriptions' ? mocks.row : [], error: null }),
      };
      return query;
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('restores Android purchases even before an RTDN subscription row exists', async () => {
    mocks.play.isPlay = true;
    render(<SubscriptionStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Google Play purchases' }));
    await waitFor(() => expect(mocks.play.restore).toHaveBeenCalledOnce());
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith('paystack_subscription_audit');
  });

  it('opens Google Play to manage an Android subscription without cancelling Paystack', async () => {
    mocks.play.isPlay = true;
    mocks.row = subscription('google_play');
    render(<SubscriptionStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage subscription in Google Play' }));
    await waitFor(() => expect(mocks.play.manage).toHaveBeenCalledOnce());
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
  });

  it('keeps website subscriptions read-only in Android without exposing Paystack actions', async () => {
    mocks.play.isPlay = true;
    mocks.row = subscription('paystack');
    render(<SubscriptionStatus />);
    expect(await screen.findByText(/This existing subscription was purchased on the website/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Google Play purchases' }));
    await waitFor(() => expect(mocks.play.restore).toHaveBeenCalledOnce());
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sync history/)).not.toBeInTheDocument();
  });

  it('uses localized Google Play prices instead of interpreting provider amounts as cents', async () => {
    mocks.play.isPlay = true;
    mocks.play.prices = { monthly: { priceString: 'R49.00' } };
    mocks.row = subscription('google_play');
    render(<SubscriptionStatus />);
    expect(await screen.findByText('R49.00')).toBeInTheDocument();
    expect(screen.queryByText(/0[.,]49/)).not.toBeInTheDocument();
  });

  it('keeps management available after renewal has been cancelled', async () => {
    mocks.play.isPlay = true;
    mocks.row = subscription('google_play', { status: 'non-renewing', cancel_at_period_end: true });
    render(<SubscriptionStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage subscription in Google Play' }));
    await waitFor(() => expect(mocks.play.manage).toHaveBeenCalledOnce());
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('directs a Google Play subscriber on the website to Google Play management', async () => {
    mocks.row = subscription('google_play');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<SubscriptionStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage subscription in Google Play' }));
    expect(open).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?package=app.lovable.habtastic',
      '_blank', 'noopener,noreferrer',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh subscription status' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh subscription status' })).toBeEnabled());
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('shows an expired Play subscription as inactive rather than a pending payment', async () => {
    mocks.play.isPlay = true;
    mocks.row = subscription('google_play', { status: 'inactive' });
    render(<SubscriptionStatus />);
    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Google Play purchases' })).toBeInTheDocument();
  });

  it('explains a failed Google Play verification and shows restore steps', async () => {
    mocks.play.isPlay = true;
    localStorage.setItem('habtastic.purchaseVerification.review-test-user', JSON.stringify({
      provider: 'google_play', plan: 'monthly', state: 'failed', code: 'account_mismatch', at: new Date().toISOString(),
    }));
    render(<SubscriptionStatus />);
    expect(await screen.findByText("We couldn't confirm your purchase")).toBeInTheDocument();
    expect(screen.getByText(/belongs to a different HabTastic account/)).toBeInTheDocument();
    expect(screen.getByText(/Tap "Restore Google Play purchases" on this screen/)).toBeInTheDocument();
    localStorage.clear();
  });

  it('hides the pending notice once the subscription is active', async () => {
    localStorage.setItem('habtastic.purchaseVerification.review-test-user', JSON.stringify({
      provider: 'paystack', plan: 'monthly', state: 'pending', code: 'verification_unavailable', at: '2026-10-01T00:00:00Z',
    }));
    mocks.row = subscription('paystack', { updated_at: new Date().toISOString() });
    render(<SubscriptionStatus />);
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Confirming your payment')).not.toBeInTheDocument();
    localStorage.clear();
  });

  it('still syncs and cancels a website Paystack subscription with Paystack', async () => {
    mocks.row = subscription('paystack');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SubscriptionStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check subscription status' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('paystack-sync-subscription', { body: {} }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('paystack-cancel'));
    expect(mocks.play.restore).not.toHaveBeenCalled();
    expect(mocks.play.manage).not.toHaveBeenCalled();
  });
});
