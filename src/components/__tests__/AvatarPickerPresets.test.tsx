import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AvatarPicker from '../AvatarPicker';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  profile: { avatar_url: null, ai_avatar_credits_used: 0 } as Record<string, unknown>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-id' } }) }));
vi.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ isPremium: false }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: mocks.profile, updateProfile: mocks.update }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({}) } } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

function openPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><AvatarPicker><button>Change avatar</button></AvatarPicker></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
}

describe('Preset avatar picker', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.update.mockResolvedValue(undefined);
    mocks.profile = { avatar_url: null, ai_avatar_credits_used: 0 };
  });

  it('filters by age and saves the chosen bundled avatar', async () => {
    openPicker();
    const filters = screen.getByRole('group', { name: 'Filter avatars by age' });
    expect(screen.getAllByRole('button', { name: /avatar \d$/ })).toHaveLength(60);
    fireEvent.click(within(filters).getByRole('button', { name: 'Older' }));
    const older = screen.getAllByRole('button', { name: /avatar \d$/ });
    expect(older).toHaveLength(20);
    const use = screen.getByRole('button', { name: 'Use this avatar' });
    expect(use).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Indian older female avatar 2' }));
    fireEvent.click(use);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ avatar_url: '/avatars/presets/indian-old-f2.webp' }));
  });

  it('previews the saved avatar before anything is picked', () => {
    mocks.profile = { avatar_url: '/avatars/presets/black-teen-m1.webp', ai_avatar_credits_used: 0, name: 'Thabo' };
    openPicker();
    expect(screen.getByText('Thabo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Avatar preview' })).toHaveAttribute('src', '/avatars/presets/black-teen-m1.webp');
    expect(screen.getByText('Your current avatar')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates the preview when an avatar is tapped, without saving it', async () => {
    openPicker();
    expect(screen.queryByRole('img', { name: 'Avatar preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Indian older female avatar 2' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Avatar preview' })).toHaveAttribute('src', '/avatars/presets/indian-old-f2.webp'));
    expect(screen.getByText('Indian older female avatar 2')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
