import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OfflineBanner from '../OfflineBanner';
import { createBackendHealthMonitor } from '@/lib/backendHealth';

describe('connection banner', () => {
  it('shows status when servers are unreachable and Retry reconnects and refreshes data', async () => {
    const fetchImpl = vi.fn((): Promise<Response> => Promise.reject(new TypeError('Failed to fetch')));
    const monitor = createBackendHealthMonitor({
      healthUrl: 'https://example.supabase.co/auth/v1/health',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelaysMs: [60_000],
      isDeviceOffline: () => false,
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <OfflineBanner monitor={monitor} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => { await monitor.checkNow(); });
    expect(screen.getByRole('alert').textContent).toContain("Can't reach HabTastic servers");

    fetchImpl.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Connected again');
    expect(invalidate).toHaveBeenCalled();
    monitor.dispose();
  });
});
