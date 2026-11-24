export enum Plan {
  FREE = "free",
  PREMIUM = "premium",
}

export const FEATURES = {
  UNLIMITED_HABITS: "unlimited_habits",
  ADVANCED_AI: "advanced_ai",
  BIOMETRIC_SCAN: "biometric_scan",
  ADVANCED_ANALYTICS: "advanced_analytics",
  CUSTOM_THEMES: "custom_themes",
  CLOUD_SYNC: "cloud_sync",
  AD_FREE: "ad_free",
  SMART_REMINDERS: "smart_reminders",
  GAMIFICATION: "gamification",
  PRIORITY_SUPPORT: "priority_support",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

export const PLAN_FEATURES: Record<Plan, Feature[]> = {
  // Personal Google Drive backup/sync is available to every signed-in user.
  // Premium controls feature depth, not ownership of the user's private data.
  [Plan.FREE]: [FEATURES.CLOUD_SYNC],
  [Plan.PREMIUM]: [
    FEATURES.UNLIMITED_HABITS,
    FEATURES.ADVANCED_AI,
    FEATURES.BIOMETRIC_SCAN,
    FEATURES.ADVANCED_ANALYTICS,
    FEATURES.CUSTOM_THEMES,
    FEATURES.AD_FREE,
    FEATURES.SMART_REMINDERS,
    FEATURES.GAMIFICATION,
    FEATURES.PRIORITY_SUPPORT,
  ],
};

// Free tier supports four active habits. Premium and the 5-day trial are unlimited.
export const FREE_HABIT_LIMIT = 4;
// Free Winston AI cap is 5 messages per day.
export const FREE_AI_DAILY_LIMIT = 5;
// Trial users get the full Premium experience for 5 days.
export const TRIAL_DAYS = 5;
export const TRIAL_AI_DAILY_LIMIT = FREE_AI_DAILY_LIMIT;

export const hasAccess = (plan: Plan, feature: Feature): boolean => {
  if (plan === Plan.PREMIUM) return true;
  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
};

export function partitionByFreeLimit<T>(
  items: readonly T[],
  isPremium: boolean,
  freeLimit: number,
): { active: T[]; locked: T[] } {
  if (isPremium) return { active: [...items], locked: [] };
  return {
    active: items.slice(0, freeLimit),
    locked: items.slice(freeLimit),
  };
}

export const FEATURE_LABELS: Record<Feature, { title: string; description: string; icon: string }> = {
  [FEATURES.UNLIMITED_HABITS]: { title: "Unlimited Habits", description: "Track as many habits as you want", icon: "📋" },
  [FEATURES.ADVANCED_AI]: { title: "Advanced AI Coaching", description: "Unlimited AI coach messages with deep insights", icon: "🤖" },
  [FEATURES.BIOMETRIC_SCAN]: { title: "Biometric Scan", description: "Premium onboarding with eye-scan visualization", icon: "👁️" },
  [FEATURES.ADVANCED_ANALYTICS]: { title: "Advanced Analytics", description: "Detailed reports, trends, and predictions", icon: "📊" },
  [FEATURES.CUSTOM_THEMES]: { title: "Custom Themes", description: "Personalize your app with premium themes", icon: "🎨" },
  [FEATURES.CLOUD_SYNC]: { title: "Google Drive Sync", description: "Back up My Diary privately in your own Google Drive", icon: "☁️" },
  [FEATURES.AD_FREE]: { title: "Ad-Free Experience", description: "Enjoy a clean, distraction-free interface", icon: "✨" },
  [FEATURES.SMART_REMINDERS]: { title: "Smart Reminders", description: "AI-powered optimal timing for reminders", icon: "⏰" },
  [FEATURES.GAMIFICATION]: { title: "Gamification", description: "Challenges, leaderboards, and XP rewards", icon: "🏆" },
  [FEATURES.PRIORITY_SUPPORT]: { title: "Priority Support", description: "Get help faster with priority assistance", icon: "💎" },
};
