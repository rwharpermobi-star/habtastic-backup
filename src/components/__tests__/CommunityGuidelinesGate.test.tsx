import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommunityGuidelinesGate from '../CommunityGuidelinesGate';
import { hasAcceptedCommunityTerms } from '@/lib/communityTerms';

const updateUser = vi.fn().mockResolvedValue({ error: null });
let currentUser: any = { id: 'u1', user_metadata: {} };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) } },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderGate = () =>
  render(
    <MemoryRouter>
      <CommunityGuidelinesGate>
        <div>Feed content</div>
      </CommunityGuidelinesGate>
    </MemoryRouter>,
  );

describe('CommunityGuidelinesGate', () => {
  beforeEach(() => {
    updateUser.mockClear();
    currentUser = { id: 'u1', user_metadata: {} };
  });

  it('blocks community content until the rules are accepted', () => {
    renderGate();
    expect(screen.queryByText('Feed content')).toBeNull();
    expect(screen.getByText('Community rules')).toBeTruthy();
  });

  it('requires the checkbox before Accept & Continue is enabled', async () => {
    renderGate();
    const btn = screen.getByRole('button', { name: /accept & continue/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I agree to the community rules'));
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({
        data: { community_terms_accepted_at: expect.any(String) },
      }),
    );
    await waitFor(() => expect(screen.getByText('Feed content')).toBeTruthy());
  });

  it('renders children immediately when metadata already has acceptance', () => {
    currentUser = { id: 'u1', user_metadata: { community_terms_accepted_at: '2026-01-01T00:00:00Z' } };
    renderGate();
    expect(screen.getByText('Feed content')).toBeTruthy();
    expect(hasAcceptedCommunityTerms(currentUser)).toBe(true);
  });

  it('treats a missing or empty metadata value as not accepted', () => {
    expect(hasAcceptedCommunityTerms(null)).toBe(false);
    expect(hasAcceptedCommunityTerms({ user_metadata: {} } as any)).toBe(false);
    expect(hasAcceptedCommunityTerms({ user_metadata: { community_terms_accepted_at: '' } } as any)).toBe(false);
  });
});
