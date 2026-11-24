const USAGE_ANALYTICS_KEY = 'habtastic:usage-analytics';
const PERSONALIZATION_KEY = 'winston-personalization';

function readPreference(key: string, defaultValue: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
  } catch {
    return defaultValue;
  }
}

function writePreference(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, String(enabled));
  } catch {
    // Locked/private storage: keep the current in-memory UI state only.
  }
}

export const isUsageAnalyticsEnabled = () => readPreference(USAGE_ANALYTICS_KEY, true);
export const setUsageAnalyticsEnabled = (enabled: boolean) => writePreference(USAGE_ANALYTICS_KEY, enabled);

export const isPersonalizationEnabled = () => readPreference(PERSONALIZATION_KEY, true);
export const setPersonalizationEnabled = (enabled: boolean) => writePreference(PERSONALIZATION_KEY, enabled);
