import { beforeEach, describe, expect, it } from 'vitest';
import {
  isPersonalizationEnabled,
  isUsageAnalyticsEnabled,
  setPersonalizationEnabled,
  setUsageAnalyticsEnabled,
} from '@/lib/privacyPreferences';

describe('privacy preferences', () => {
  beforeEach(() => localStorage.clear());

  it('uses the documented enabled defaults', () => {
    expect(isUsageAnalyticsEnabled()).toBe(true);
    expect(isPersonalizationEnabled()).toBe(true);
  });

  it('persists analytics opt-out and personalization choices', () => {
    setUsageAnalyticsEnabled(false);
    setPersonalizationEnabled(false);
    expect(isUsageAnalyticsEnabled()).toBe(false);
    expect(isPersonalizationEnabled()).toBe(false);

    setUsageAnalyticsEnabled(true);
    setPersonalizationEnabled(true);
    expect(isUsageAnalyticsEnabled()).toBe(true);
    expect(isPersonalizationEnabled()).toBe(true);
  });
});
