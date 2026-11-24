import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackendHealthMonitor } from '../backendHealth';

const ok = () => Promise.resolve(new Response('{}', { status: 200 }));
const down = (): Promise<Response> => Promise.reject(new TypeError('Failed to fetch'));

function make(fetchImpl: ReturnType<typeof vi.fn>, offline = false) {
  return createBackendHealthMonitor({
    healthUrl: 'https://example.supabase.co/auth/v1/health',
    apiKey: 'sb_publishable_test',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retryDelaysMs: [5_000, 10_000],
    isDeviceOffline: () => offline,
  });
}

describe('backend health monitor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('stays ok when a request fails but the health probe succeeds', async () => {
    const fetchImpl = vi.fn(ok);
    const m = make(fetchImpl);
    m.reportFailure();
    await vi.runAllTicks();
    await Promise.resolve();
    await m.checkNow();
    expect(m.getSnapshot().status).toBe('ok');
  });

  it('marks unreachable only after the probe fails, and sends the publishable key', async () => {
    const fetchImpl = vi.fn(down);
    const m = make(fetchImpl);
    await m.checkNow();
    expect(m.getSnapshot().status).toBe('unreachable');
    expect(m.getSnapshot().failures).toBe(1);
    const init = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_test');
    m.dispose();
  });

  it('treats 503 from the probe as unreachable but 401 as reachable', async () => {
    const m503 = make(vi.fn(() => Promise.resolve(new Response('', { status: 503 }))));
    expect(await m503.checkNow()).toBe(false);
    const m401 = make(vi.fn(() => Promise.resolve(new Response('', { status: 401 }))));
    expect(await m401.checkNow()).toBe(true);
    m503.dispose();
  });

  it('retries automatically on the backoff schedule and recovers', async () => {
    const fetchImpl = vi.fn(down);
    const m = make(fetchImpl);
    const recovered = vi.fn();
    m.onRecovered(recovered);
    await m.checkNow();
    expect(m.getSnapshot().nextRetryAt).toBe(Date.now() + 5_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(m.getSnapshot().failures).toBe(2);

    fetchImpl.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(m.getSnapshot().status).toBe('ok');
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('recovers immediately when any real request succeeds', async () => {
    const m = make(vi.fn(down));
    const recovered = vi.fn();
    m.onRecovered(recovered);
    await m.checkNow();
    m.reportSuccess();
    expect(m.getSnapshot().status).toBe('ok');
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('does not probe while the device itself is offline', () => {
    const fetchImpl = vi.fn(down);
    const m = make(fetchImpl, true);
    m.reportFailure();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shares one probe across concurrent retries', async () => {
    const fetchImpl = vi.fn(down);
    const m = make(fetchImpl);
    await Promise.all([m.checkNow(), m.checkNow(), m.checkNow()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    m.dispose();
  });
});
