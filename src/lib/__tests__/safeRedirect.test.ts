import { describe, it, expect } from 'vitest';
import { getSafeRedirect } from '@/lib/safeRedirect';
describe('getSafeRedirect', () => {
  it('accepts relative paths', () => {
    expect(getSafeRedirect('?redirect=/delete-account')).toBe('/delete-account');
    expect(getSafeRedirect('?next=/profile')).toBe('/profile');
  });
  it('rejects unsafe values', () => {
    for (const q of ['?redirect=//evil.com', '?redirect=http://evil.com', '?redirect=javascript:alert(1)', '']) {
      expect(getSafeRedirect(q)).toBeNull();
    }
  });
});
