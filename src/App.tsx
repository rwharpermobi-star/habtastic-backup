import { lazy, Suspense, useState, useEffect } from "react";
import { logInfo } from "@/lib/logger";
import { getSafeRedirect } from "@/lib/safeRedirect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useNativePush } from "@/hooks/useNativePush";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BackgroundMusicProvider } from "@/contexts/BackgroundMusicContext";
import BottomNav from "@/components/BottomNav";
import SplashScreen from "@/components/SplashScreen";
import IconRefreshNotice from "@/components/IconRefreshNotice";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import PageLoader from "@/components/PageLoader";
import OfflineBanner from "@/components/OfflineBanner";
import { logError } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";

import { useProfile } from "./hooks/useProfile";
import { useWarmStart } from "@/hooks/useWarmStart";
import { useConfetti } from "./hooks/useConfetti";
import {
  markAuthedUiReady,
  recordLandingFlashRegression,
} from "@/lib/authTelemetry";

import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import AutoTranslateProvider from "@/i18n/AutoTranslateProvider";
import "@/i18n/config";
import PermissionRationaleHost from "@/components/PermissionRationaleHost";

function SwipeNavigationProvider() {
  useSwipeNavigation();
  return null;
}

// Retry dynamic imports once on failure (handles stale chunk hashes after redeploy)
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const RELOAD_KEY = "lovable:chunk-reload";
    try {
      return await factory();
    } catch (err) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY);
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        // Return a never-resolving promise while the page reloads
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// Lazy load all pages
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Habits = lazyWithRetry(() => import("./pages/Habits"));
const Progress = lazyWithRetry(() => import("./pages/Progress"));
const MonthlyReport = lazyWithRetry(() => import("./pages/MonthlyReport"));
const Coach = lazyWithRetry(() => import("./pages/Coach"));
const MoneySaver = lazyWithRetry(() => import("./pages/MoneySaver"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Challenges = lazyWithRetry(() => import("./pages/Challenges"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const FCMDebug = lazyWithRetry(() => import("./pages/FCMDebug"));
const NotificationSetup = lazyWithRetry(() => import("./pages/NotificationSetup"));
const Onboarding = lazyWithRetry(() => import("./pages/Onboarding"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Journal = lazyWithRetry(() => import("./pages/Journal"));
const Diary = lazyWithRetry(() => import("./pages/Diary"));
const About = lazyWithRetry(() => import("./pages/About"));
const Referral = lazyWithRetry(() => import("./pages/Referral"));
const ReferralHistory = lazyWithRetry(() => import("./pages/ReferralHistory"));
const ReferralRules = lazyWithRetry(() => import("./pages/ReferralRules"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const NotificationsSettings = lazyWithRetry(() => import("./pages/NotificationsSettings"));
const PrivacySettings = lazyWithRetry(() => import("./pages/PrivacySettings"));
const CoachSettings = lazyWithRetry(() => import("./pages/CoachSettings"));
const Achievements = lazyWithRetry(() => import("./pages/Achievements"));
const Redeem = lazyWithRetry(() => import("./pages/Redeem"));
const Feedback = lazyWithRetry(() => import("./pages/Feedback"));
const SubmitFeedback = lazyWithRetry(() => import("./pages/SubmitFeedback"));
const Banking = lazyWithRetry(() => import("./pages/Banking"));
const AdminPayouts = lazyWithRetry(() => import("./pages/AdminPayouts"));
const AdminFeedback = lazyWithRetry(() => import("./pages/AdminFeedback"));
const LanguageSettings = lazyWithRetry(() => import("./pages/LanguageSettings"));

const AppearanceSettings = lazyWithRetry(() => import("./pages/AppearanceSettings"));
const SoundHapticsSettings = lazyWithRetry(() => import("./pages/SoundHapticsSettings"));
const HabitsAISettings = lazyWithRetry(() => import("./pages/HabitsAISettings"));
const DataSettings = lazyWithRetry(() => import("./pages/DataSettings"));
const Leaderboard = lazyWithRetry(() => import("./pages/Leaderboard"));
const WellnessHub = lazyWithRetry(() => import("./pages/WellnessHub"));
const CheckoutSuccess = lazyWithRetry(() => import("./pages/CheckoutSuccess"));
const CheckoutCancelled = lazyWithRetry(() => import("./pages/CheckoutCancelled"));
const CheckoutFailed = lazyWithRetry(() => import("./pages/CheckoutFailed"));
const Friends = lazyWithRetry(() => import("./pages/Friends"));
const StreakShieldDetails = lazyWithRetry(() => import("./pages/StreakShieldDetails"));
const XPBreakdown = lazyWithRetry(() => import("./pages/XPBreakdown"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const WeeklyReview = lazyWithRetry(() => import("./pages/WeeklyReview"));
const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const Refunds = lazyWithRetry(() => import("./pages/Refunds"));
const Cancellation = lazyWithRetry(() => import("./pages/Cancellation"));
const DeleteAccount = lazyWithRetry(() => import("./pages/DeleteAccount"));
const Contact = lazyWithRetry(() => import("./pages/Contact"));
const Health = lazyWithRetry(() => import("./pages/Health"));
const SubscriptionStatus = lazyWithRetry(() => import("./pages/SubscriptionStatus"));

const CoinHistory = lazyWithRetry(() => import("./pages/CoinHistory"));
const AvatarStudio = lazyWithRetry(() => import("./pages/AvatarStudio"));
const Shop = lazyWithRetry(() => import("./pages/Shop"));
const ShopSuccess = lazyWithRetry(() => import("./pages/ShopSuccess"));
const Community = lazyWithRetry(() => import("./pages/Community"));
const CommunityProfile = lazyWithRetry(() => import("./pages/CommunityProfile"));
const AdminModeration = lazyWithRetry(() => import("./pages/AdminModeration"));
const AdminAnalytics = lazyWithRetry(() => import("./pages/AdminAnalytics"));
const AdminReferrals = lazyWithRetry(() => import("./pages/AdminReferrals"));
const AdminTelemetry = lazyWithRetry(() => import("./pages/AdminTelemetry"));
const BackendMigration = lazyWithRetry(() => import("./pages/BackendMigration"));
const DevPerf = lazyWithRetry(() => import("./pages/DevPerf"));
const ReferralApplied = lazyWithRetry(() => import("./pages/ReferralApplied"));
const OAuthConsent = lazyWithRetry(() => import("./pages/OAuthConsent"));
const Landing = lazyWithRetry(() => import("./pages/Landing"));
// Pulls in useHabits (and therefore the Supabase client) — keep it lazy so it
// never lands in the eager startup graph.
const InAppReminderFallback = lazyWithRetry(() =>
  import("@/hooks/useInAppReminderFallback").then((m) => ({ default: m.InAppReminderFallback })),
);


const HabitReminderEffects = lazyWithRetry(() => import("@/components/HabitReminderEffects"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function hasCachedSupabaseSession() {
  try {
    // Supabase v2 stores its session under sb-<ref>-auth-token
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch { /* SSR / locked storage */ }
  return false;
}

/**
 * Landing wrapper. If the marketing page ever renders while a Supabase session
 * exists in storage, that is the auth-routing regression we guard against —
 * record it (non-PII) so it shows up in telemetry instead of silently shipping.
 */
function PublicLanding() {
  useEffect(() => {
    if (hasCachedSupabaseSession()) {
      recordLandingFlashRegression({
        pathname: window.location.pathname,
        authLoading: false,
      });
    }
  }, []);
  return <Landing />;
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { pathname } = useLocation();
  useNativePush();
  useWarmStart(user?.id);

  // Fail-safe: if the profile query is still loading after 8s (e.g. bad
  // network), we release the gate so the user isn't trapped on a spinner.
  // The individual pages already tolerate an undefined profile and the query
  // continues in the background — this just prevents a blank blocking screen.
  // Prefetch the Dashboard chunk while auth is still hydrating (cached session
  // only) so the loader -> Dashboard hand-off has nothing left to download.
  useEffect(() => {
    if (!authLoading) return;
    if (!hasCachedSupabaseSession()) return;
    void import("./pages/Dashboard");
  }, [authLoading]);

  const [profileTimedOut, setProfileTimedOut] = useState(false);
  useEffect(() => {
    if (!user || !profileLoading) { setProfileTimedOut(false); return; }
    const t = setTimeout(() => setProfileTimedOut(true), 8_000);
    return () => clearTimeout(t);
  }, [user, profileLoading]);

  // Consume ?next=<same-origin path> after auth completes so OAuth consent
  // (and any other pre-auth deep link) returns to the intended URL.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) return;
    if (window.location.pathname + window.location.search === next) return;
    window.history.replaceState({}, "", next);
    // Force React Router to pick up the new location.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [user]);

  // Always-available public routes (must work regardless of auth/onboarding state).
  // Password recovery in particular: the recovery link auto-signs the user in via
  // detectSessionInUrl, so we must render /reset-password before the auth branches.
  // /fcm-debug is also hoisted so the diagnostics screen is reachable in every state.
  if (pathname === "/index" || pathname === "/index.html") {
    return <Navigate to="/" replace />;
  }
  // Public marketing homepage only for signed-out visitors. Authenticated users
  // fall through so "/" renders the Dashboard (all in-app "Home" links use "/").
  // While auth is still hydrating, a returning user with a cached Supabase
  // session must not flash the marketing page before the Dashboard appears.
  // Single source of truth: while auth hydration is in flight we never decide
  // "logged out". Everyone (cached session or not) gets the branded loader, so
  // a returning user can never flash the marketing page before the Dashboard.
  if (authLoading) {
    return <PageLoader />;
  }
  if (pathname === "/" && !user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<PublicLanding />} />
        </Routes>
      </Suspense>
    );
  }

  if (user && (pathname === "/auth" || pathname === "/login" || pathname === "/signup")) {
    // Respect a safe same-origin return path (e.g. /login?redirect=/delete-account).
    return <Navigate to={getSafeRedirect() ?? "/app"} replace />;
}
  // Cold-start / reload session persistence: if a valid Supabase session
  // has hydrated the user, never leave them stranded on auth-entry paths.
  // /fcm-debug requires an authenticated session (falls through to auth routes when logged out).
  if (pathname === "/reset-password" || pathname === "/forgot-password") {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense>
    );
  }

  if (user && profileLoading && !profileTimedOut) {
    return <PageLoader />;
  }




  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/" element={<PublicLanding />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/signup" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route path="/reset-password" element={<ResetPassword />} />
          {/* /fcm-debug intentionally gated: only accessible to signed-in users */}
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/refund-policy" element={<Refunds />} />
          <Route path="/cancellation" element={<Cancellation />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/health" element={<Health />} />
          <Route path="*" element={<Auth />} />
        </Routes>
      </Suspense>
    );
  }

  if (profile && !profile.onboarding_complete) {
    logInfo("navigation", "[gate] routing to onboarding", {
      userId: user.id,
      onboarding_complete: profile.onboarding_complete,
    });
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/referral-applied" element={<ReferralApplied />} />
          <Route path="/fcm-debug" element={<FCMDebug />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/refund-policy" element={<Refunds />} />
          <Route path="/cancellation" element={<Cancellation />} />
          <Route path="*" element={<Onboarding />} />
        </Routes>
      </Suspense>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  useEffect(() => {
    markAuthedUiReady();
  }, []);
  return (
    <>
      <Suspense fallback={null}><HabitReminderEffects /></Suspense>
      <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>

        <Routes>
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/app" element={<Dashboard />} />

          <Route path="/habits" element={<Habits />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/progress/monthly" element={<MonthlyReport />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/money-saver" element={<MoneySaver />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="/referral" element={<Referral />} />
          <Route path="/referral-applied" element={<ReferralApplied />} />
          <Route path="/referral/history" element={<ReferralHistory />} />
          <Route path="/referral/rules" element={<ReferralRules />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings/notifications" element={<NotificationsSettings />} />
          <Route path="/settings/privacy" element={<PrivacySettings />} />
          <Route path="/settings/coach" element={<CoachSettings />} />
          <Route path="/winston-settings" element={<Navigate to="/settings/coach" replace />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/settings/redeem" element={<Redeem />} />
          <Route path="/settings/feedback" element={<Feedback />} />
          <Route path="/settings/feedback/submit" element={<SubmitFeedback />} />
          <Route path="/settings/language" element={<LanguageSettings />} />
          <Route path="/settings/appearance" element={<AppearanceSettings />} />
          <Route path="/settings/sound" element={<SoundHapticsSettings />} />
          <Route path="/settings/habits-ai" element={<HabitsAISettings />} />
          <Route path="/settings/data" element={<DataSettings />} />
          <Route path="/settings/banking" element={<Banking />} />
          <Route path="/admin/payouts" element={<AdminPayouts />} />
          <Route path="/admin/feedback" element={<AdminFeedback />} />
          
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/wellness" element={<WellnessHub />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/checkout/cancel" element={<CheckoutCancelled />} />
          <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
          <Route path="/checkout/failed" element={<CheckoutFailed />} />
          <Route path="/shop/cancel" element={<CheckoutCancelled />} />
          <Route path="/shop/failed" element={<CheckoutFailed />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/streak-shield" element={<StreakShieldDetails />} />
          <Route path="/xp-breakdown" element={<XPBreakdown />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/weekly-review" element={<WeeklyReview />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/refund-policy" element={<Refunds />} />
          <Route path="/cancellation" element={<Cancellation />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings/subscription" element={<SubscriptionStatus />} />

          <Route path="/coins" element={<CoinHistory />} />
          <Route path="/avatar" element={<AvatarStudio />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/success" element={<ShopSuccess />} />
          <Route path="/community" element={<Community />} />
          <Route path="/u/:userId" element={<CommunityProfile />} />
          <Route path="/me" element={<CommunityProfile />} />
          <Route path="/admin/moderation" element={<AdminModeration />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/referrals" element={<AdminReferrals />} />
          <Route path="/admin/telemetry" element={<AdminTelemetry />} />
          <Route path="/admin/backend" element={<BackendMigration />} />
          <Route path="/dev/perf" element={<DevPerf />} />
          <Route path="/fcm-debug" element={<FCMDebug />} />
          <Route path="/settings/notifications-setup" element={<NotificationSetup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
      <BottomNav />
      <SwipeNavigationProvider />
    </>
  );
}

const App = () => {
  // Android already launches through a native splash, but keeping the short
  // branded hand-off there avoids a white WebView frame on a true cold start.
  // Web routes must render immediately: a fixed 1.8s splash made every signed-
  // out page (including login and legal pages) feel unavailable on reload.
  const hasCachedSession = hasCachedSupabaseSession();

  const [showSplash, setShowSplash] = useState(
    () => Capacitor.isNativePlatform() && !hasCachedSession,
  );
  const { fireConfetti } = useConfetti();

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
      fireConfetti();
    }, 1800);
    return () => clearTimeout(timer);
  }, [fireConfetti, showSplash]);

  useEffect(() => {
    // Lazy import to avoid pulling sonner before providers mount
    const notify = async (msg: string) => {
      try {
        const { toast } = await import("sonner");
        toast.error("Something went wrong", { description: msg.slice(0, 140) });
      } catch {
        /* noop */
      }
    };
    const onError = (e: ErrorEvent) => {
      logError("unhandled", e.message || "window.onerror", e.error, {
        filename: e.filename,
        lineno: e.lineno,
        route: window.location.pathname,
      });
      notify(e.message || "Unexpected error");
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = typeof reason === "string" ? reason : reason?.message || "Unhandled promise rejection";
      logError("unhandled", "unhandledrejection", reason, { route: window.location.pathname });
      notify(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OfflineBanner />
        <SplashScreen show={showSplash} />
        <BrowserRouter>
          <AuthProvider>
            <ThemeProvider>
              <BackgroundMusicProvider>
                <AutoTranslateProvider>
                  <Sonner />
                  <PermissionRationaleHost />
                  <IconRefreshNotice />
                  <InAppReminderFallback />
                  <ErrorBoundary>
                    <AppRoutes />
                  </ErrorBoundary>
                  
                  
                </AutoTranslateProvider>
              </BackgroundMusicProvider>
            </ThemeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;