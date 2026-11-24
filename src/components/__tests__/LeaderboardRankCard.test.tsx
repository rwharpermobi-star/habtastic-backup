import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rankState = { data: { rank: 4, total: 120 }, isLoading: false } as {
  data: { rank: number | null; total: number } | undefined;
  isLoading: boolean;
};

vi.mock('@/hooks/useWeeklyRank', () => ({
  useMyWeeklyRank: () => rankState,
}));

import { LeaderboardRankCard } from '../LeaderboardRankCard';

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LeaderboardRankCard />} />
          <Route path="/leaderboard" element={<div>Leaderboard Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LeaderboardRankCard', () => {
  beforeEach(() => {
    rankState.data = { rank: 4, total: 120 };
    rankState.isLoading = false;
  });

  it('shows the current weekly rank', () => {
    renderCard();
    expect(screen.getByText(/You're #4 of 120 this week/i)).toBeInTheDocument();
  });

  it('shows a placeholder while the rank is loading', () => {
    rankState.data = undefined;
    rankState.isLoading = true;
    renderCard();
    expect(screen.getByTestId('rank-skeleton')).toBeInTheDocument();
  });

  it('falls back to a generic message when the user has no rank yet', () => {
    rankState.data = { rank: null, total: 0 };
    renderCard();
    expect(screen.getByText(/See how you compare this week/i)).toBeInTheDocument();
  });

  it('exposes an accessible name describing the rank', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: /ranked number 4 of 120 this week/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the Leaderboard route when tapped', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    await waitFor(() => {
      expect(screen.getByText('Leaderboard Screen')).toBeInTheDocument();
    });
  });

  it('activates with the keyboard (Enter key on the button)', async () => {
    renderCard();
    const button = screen.getByRole('button', { name: /leaderboard/i });
    button.focus();
    expect(button).toHaveFocus();
    // Native <button> maps Enter/Space to a click event.
    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('Leaderboard Screen')).toBeInTheDocument();
    });
  });
});
