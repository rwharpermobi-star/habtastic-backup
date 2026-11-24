import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/lazyClient', () => ({
  getSupabase: async () => ({
    functions: {
      invoke: invokeMock,
    },
  }),
}));

import {
  CompromisedPasswordError,
  PasswordSafetyUnavailableError,
  assertPasswordIsNotCompromised,
  getPwnedPasswordCount,
} from '@/lib/pwnedPassword';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pwned password screening', () => {
  it('uses the k-anonymity prefix and detects a known breached password', async () => {
    invokeMock.mockResolvedValueOnce({
      data: '1E4C9B93F3F0682250B6CF8331B7EE68FD8:33000000\\r\\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2',
      error: null,
    });

    const count = await getPwnedPasswordCount('password');

    expect(count).toBe(33000000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('pwned-password-range', { body: { prefix: '5BAA6' } });
  });

  it('allows a password whose suffix is absent from the returned range', async () => {
    invokeMock.mockResolvedValueOnce({
      data: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1',
      error: null,
    });

    await expect(assertPasswordIsNotCompromised('a long unique test phrase 9327!')).resolves.toBeUndefined();
  });

  it('rejects a compromised password', async () => {
    invokeMock.mockResolvedValueOnce({
      data: '1E4C9B93F3F0682250B6CF8331B7EE68FD8:12',
      error: null,
    });

    await expect(assertPasswordIsNotCompromised('password')).rejects.toBeInstanceOf(
      CompromisedPasswordError,
    );
  });

  it('fails closed if the breach service cannot be reached', async () => {
    invokeMock.mockRejectedValueOnce(new Error('offline'));

    await expect(assertPasswordIsNotCompromised('anything')).rejects.toBeInstanceOf(
      PasswordSafetyUnavailableError,
    );
  });
});
