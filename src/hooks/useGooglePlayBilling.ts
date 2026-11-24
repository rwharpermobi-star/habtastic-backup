import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  isPlayBillingAvailable,
  loadPlayPrices,
  openPlaySubscriptionManagement,
  PlayVerificationError,
  purchasePlayPlan,
  restorePlayPurchases,
  shouldUsePlayBilling,
  type PlayPlan,
  type PlayPrice,
} from '@/lib/googlePlayBilling';
import { alreadySubscribedMessage, fetchBlockingSubscription } from '@/lib/subscriptionGuard';
import { clearVerificationRecord, saveVerificationRecord, verificationStateForCode } from '@/lib/purchaseVerification';

const STATUS_PATH = '/settings/subscription';

/**
 * Google Play Billing state for the Android build. On web every flag stays
 * false so the existing Paystack flow is untouched.
 */
export function useGooglePlayBilling() {
  const { user, checkSubscription } = useAuth();
  const navigate = useNavigate();
  const isPlay = shouldUsePlayBilling();
  const [supported, setSupported] = useState(false);
  const [prices, setPrices] = useState<Partial<Record<PlayPlan, PlayPrice>>>({});
  const [loadingPrices, setLoadingPrices] = useState(isPlay);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isPlay) return;
    let cancelled = false;
    (async () => {
      const ok = await isPlayBillingAvailable();
      if (cancelled) return;
      setSupported(ok);
      if (!ok) { setLoadingPrices(false); return; }
      try {
        const p = await loadPlayPrices();
        if (!cancelled) setPrices(p);
      } catch (e) {
        console.warn('[play-billing] price load failed', e);
      } finally {
        if (!cancelled) setLoadingPrices(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isPlay]);

  const purchase = useCallback(async (plan: PlayPlan) => {
    if (!isPlay) return false;
    if (!user?.id) { toast.error('Please sign in to upgrade.'); return false; }
    if (inFlight.current) return false;
    inFlight.current = true;
    setPurchasing(true);
    try {
      const existing = await fetchBlockingSubscription(user.id).catch(() => null);
      if (existing) {
        toast.info(alreadySubscribedMessage(existing.provider));
        return false;
      }
      window.__lovableEvents?.track?.('project.subscription_checkout_started', { provider: 'google_play', plan });
      await purchasePlayPlan(plan, user.id);
      window.__lovableEvents?.track?.('project.subscription_purchased', { provider: 'google_play', plan });
      clearVerificationRecord(user.id);
      await checkSubscription();
      toast.success('Purchase verified. Premium will activate as soon as Google confirms it.');
      return true;
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/cancel/i.test(msg)) {
        window.__lovableEvents?.track?.('project.subscription_checkout_cancelled', { provider: 'google_play', plan });
        toast.info('Purchase cancelled.');
      } else {
        console.error('[play-billing] purchase failed', e);
        const verificationFailed = e instanceof PlayVerificationError || /token|verify|entitle|account|product/i.test(msg);
        if (verificationFailed) {
          const code = e instanceof PlayVerificationError ? e.code : 'verification_unavailable';
          window.__lovableEvents?.track?.('project.subscription_verification_failed', {
            provider: 'google_play',
            plan,
            reason: 'verification_error',
          });
          saveVerificationRecord(user.id, { provider: 'google_play', plan, code });
          const pending = verificationStateForCode(code) === 'pending';
          toast.error(
            pending
              ? 'Payment went through but we could not confirm it yet. Premium will switch on automatically within a few minutes — do not buy again.'
              : 'We could not confirm this purchase for your account. Do not buy again — see how to restore it.',
            { action: { label: 'View status', onClick: () => navigate(STATUS_PATH) }, duration: 10_000 },
          );
        } else {
          toast.error('Google Play could not complete the purchase. Please try again.');
        }
      }
      return false;
    } finally {
      inFlight.current = false;
      setPurchasing(false);
    }
  }, [isPlay, user?.id, checkSubscription, navigate]);

  const restore = useCallback(async () => {
    if (!isPlay) return false;
    if (!user?.id) { toast.error('Please sign in first.'); return false; }
    setRestoring(true);
    try {
      const result = await restorePlayPurchases(user.id);
      await checkSubscription();
      if (result?.verified && result?.entitled) clearVerificationRecord(user.id);
      if (result?.verified && result?.entitled) toast.success('Purchase verified. Premium will activate after Google confirms it.');
      else toast.info('No active Google Play subscription found for this account.');
      return !!(result?.verified && result?.entitled);
    } catch (e) {
      console.error('[play-billing] restore failed', e);
      toast.error('Could not restore purchases. Please try again.');
      return false;
    } finally {
      setRestoring(false);
    }
  }, [isPlay, user?.id, checkSubscription]);

  const manage = useCallback(async () => {
    if (!isPlay) return;
    // openPlaySubscriptionManagement opens the app's Google Play subscriptions.
    try {
      await openPlaySubscriptionManagement();
    } catch (e) {
      console.error('[play-billing] manage failed', e);
      toast.error('Could not open Google Play subscriptions.');
    }
  }, [isPlay]);

  return { isPlay, supported, prices, loadingPrices, purchasing, restoring, purchase, restore, manage };
}
