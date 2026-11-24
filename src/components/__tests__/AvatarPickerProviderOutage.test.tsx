import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AvatarPicker from '../AvatarPicker';
import { AVATAR_SERVICE_BREAK_MESSAGE } from '@/lib/avatarServiceErrors';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-id' } }) }));
vi.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ isPremium: false }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { avatar_url: null, ai_avatar_credits_used: 0, ai_avatar_credits_reset_at: new Date().toISOString() }, updateProfile: mocks.update }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: () => ({}) },
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  },
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));

function mockResponse(status: number, payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status })));
}

function openAiTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><AvatarPicker><button>Change avatar</button></AvatarPicker></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI Generate' }));
}

const oldBillingText = 'OpenAI API rate limit or usage limit reached. Check your OpenAI API billing and limits. Your HabTastic avatar credits have not been used.';

describe('AI avatar provider outage', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    [429, { code: 'RATE_LIMITED', error: oldBillingText, status: 429 }],
    [402, { code: 'PROVIDER_BILLING_REQUIRED', error: oldBillingText, status: 402 }],
    [401, { code: 'API_KEY_INVALID', error: oldBillingText, status: 401 }],
    [403, { code: 'SERVICE_PAUSED', error: oldBillingText, status: 403 }],
    [429, { error: 'Too many requests' }],
  ])('shows the friendly message and switches to the 60 presets on HTTP %i', async (status, payload) => {
    mockResponse(status, payload);
    openAiTab();
    fireEvent.click(screen.getByRole('button', { name: /Generate AI Avatar/ }));
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(AVATAR_SERVICE_BREAK_MESSAGE));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Filter avatars by age' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /avatar \d$/ })).toHaveLength(60);
    expect(screen.getByText(AVATAR_SERVICE_BREAK_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/OpenAI|billing/i)).toBeNull();
  });

  it('never falls back to an illustrated or instant avatar and leaves the avatar unchanged', async () => {
    mockResponse(402, { code: 'PROVIDER_BILLING_REQUIRED', status: 402 });
    openAiTab();
    fireEvent.click(screen.getByRole('button', { name: /Generate AI Avatar/ }));
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(AVATAR_SERVICE_BREAK_MESSAGE));
    expect(screen.queryByRole('button', { name: /instant avatar/i })).toBeNull();
    expect(screen.queryByText(/instant|illustrated/i)).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('has no instant-avatar option on the AI Generate tab', () => {
    openAiTab();
    expect(screen.getByRole('button', { name: /Generate AI Avatar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /instant avatar/i })).toBeNull();
    expect(screen.queryByText(/illustrated|instant/i)).toBeNull();
  });

  it('still asks the user to sign in again on their own expired session', async () => {
    mockResponse(401, { error: 'Unauthorized' });
    openAiTab();
    fireEvent.click(screen.getByRole('button', { name: /Generate AI Avatar/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Please sign in again to generate an avatar.'));
    expect(mocks.info).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Filter avatars by age' })).toBeNull();
  });
});
