import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, BarChart3, Sparkles, KeyRound, Shield, Loader2, Eye, EyeOff,
  ChevronRight, ShieldCheck, Smartphone, Copy, Download, Trash2, FileDown, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { assertPasswordIsNotCompromised } from '@/lib/pwnedPassword';
import { useAuth } from '@/contexts/AuthContext';
import Enable2FAPrompt from '@/components/Enable2FAPrompt';
import { useHabits } from '@/hooks/useHabits';
import { adsSupported, showAdsPrivacyOptions } from '@/lib/ads/adService';
import {
  deleteGoogleDrivePrivateSnapshot,
  getPrivateDataAccessToken,
  isGoogleDrivePrivateDataAvailable,
} from '@/lib/googleDrivePrivateData';
import { saveFile } from '@/lib/saveFile';
import {
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
} from '@/lib/journalPrivateData';
import { journalPrivateLocalKey } from '@/lib/journalPrivateStorage';
import {
  isPersonalizationEnabled,
  isUsageAnalyticsEnabled,
  setPersonalizationEnabled,
  setUsageAnalyticsEnabled,
} from '@/lib/privacyPreferences';

/* ─── Strong password validation ─── */
function validateStrongPassword(pwd: string): string | null {
  if (pwd.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-z]/.test(pwd)) return 'Add a lowercase letter.';
  if (!/[A-Z]/.test(pwd)) return 'Add an uppercase letter.';
  if (!/[0-9]/.test(pwd)) return 'Add a number.';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Add a symbol (e.g. ! @ # $).';
  if (/(.)\1{3,}/.test(pwd)) return 'Avoid 4+ repeated characters.';
  return null;
}

export default function PrivacySettings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { allHabits } = useHabits();

  const [dataTracking, setDataTracking] = useState(isUsageAnalyticsEnabled);
  const [personalization, setPersonalization] = useState(isPersonalizationEnabled);
  const [adPrivacyBusy, setAdPrivacyBusy] = useState(false);

  const handleAdPrivacy = async () => {
    setAdPrivacyBusy(true);
    try {
      const opened = await showAdsPrivacyOptions();
      if (!opened) toast.info('Ad privacy choices are not required for this account or region.');
    } finally {
      setAdPrivacyBusy(false);
    }
  };

  const handleDataTracking = (enabled: boolean) => {
    setDataTracking(enabled);
    setUsageAnalyticsEnabled(enabled);
    toast.success(enabled ? 'Anonymous usage analytics enabled' : 'Anonymous usage analytics disabled');
  };

  const handlePersonalization = (enabled: boolean) => {
    setPersonalization(enabled);
    setPersonalizationEnabled(enabled);
    toast.success(enabled ? 'Personalization enabled' : 'Personalization disabled');
  };

  /* ─── Change Password ─── */
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (!user?.email) { setPwdError('No email on account.'); return; }
    if (!currentPwd) { setPwdError('Enter your current password.'); return; }
    const strongErr = validateStrongPassword(newPwd);
    if (strongErr) { setPwdError(strongErr); return; }
    if (newPwd !== confirmPwd) { setPwdError('New passwords do not match.'); return; }
    if (newPwd === currentPwd) { setPwdError('New password must differ from current.'); return; }

    setSavingPwd(true);
    try {
      // Reauthenticate to verify current password
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: currentPwd,
      });
      if (reauthErr) {
        setPwdError('Current password is incorrect.');
        return;
      }
      try {
        await assertPasswordIsNotCompromised(newPwd);
      } catch (error) {
        setPwdError(error instanceof Error ? error.message : 'Choose a different password.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        const m = error.message?.toLowerCase() || '';
        if (m.includes('weak') || m.includes('pwned') || m.includes('compromised'))
          setPwdError('This password has been seen in a data breach. Choose a different one.');
        else setPwdError(error.message || 'Failed to update password.');
        return;
      }
      toast.success('Password updated 🔐');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setPwdError(err?.message || 'Something went wrong.');
    } finally { setSavingPwd(false); }
  };

  /* ─── 2FA / TOTP ─── */
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const loadFactors = useCallback(async () => {
    setMfaLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnrolled((data?.totp || []).some(f => f.status === 'verified'));
    setMfaLoading(false);
  }, []);

  useEffect(() => { loadFactors(); }, [loadFactors]);

  const startEnroll = async () => {
    setEnrolling(true);
    setOtpCode('');
    try {
      // Clean stale unverified factors
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.totp || [])) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `HabTastic-${Date.now()}`,
      });
      if (error) throw error;
      setEnrollFactorId(data.id);
      setEnrollQr(data.totp.qr_code);
      setEnrollSecret(data.totp.secret);
      setEnrollOpen(true);
    } catch (e) {
      toast.error(e?.message || 'Could not start 2FA setup');
    } finally { setEnrolling(false); }
  };

  const verifyEnroll = async () => {
    if (!enrollFactorId) return;
    if (!/^\d{6}$/.test(otpCode)) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setVerifyingOtp(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId, challengeId: ch.id, code: otpCode,
      });
      if (vErr) throw vErr;
      toast.success('Two-factor authentication enabled 🛡️');
      setEnrollOpen(false);
      setEnrollQr(null); setEnrollSecret(null); setEnrollFactorId(null);
      await loadFactors();
    } catch (e) {
      toast.error(e?.message || 'Invalid code. Try again.');
    } finally { setVerifyingOtp(false); }
  };

  const disable2FA = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of (data?.totp || [])) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      toast.success('Two-factor authentication disabled');
      setDisableOpen(false);
      await loadFactors();
    } catch (e) {
      toast.error(e?.message || 'Could not disable 2FA');
    }
  };

  /* ─── Export Data ─── */
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const [{ data: profile }, { data: journal }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user!.id).maybeSingle(),
        // Journal plaintext is excluded from this page because it has no PIN gate.
        Promise.resolve({ data: [] as any[] }),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        user_id: user?.id,
        email: user?.email,
        profile,
        habits: allHabits,
        journal_entries: journal || [],
        journal_export_note: 'Journal entries are protected by the Journal passcode and are not included in this settings export.',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const filename = `habtastic-data-${new Date().toISOString().split('T')[0]}.json`;
      const saved = await saveFile(blob, filename);
      toast.success(`Export ready: ${saved.filename}`, {
        description: `Saved via ${saved.location}.`,
        duration: 7000,
      });
    } catch (e) {
      toast.error(e?.message || 'Export failed');
    } finally { setExporting(false); }
  };

  /* ─── Delete Account ─── */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!user?.id) {
      toast.error('Could not identify this account. Please sign in again.');
      return;
    }

    setDeleting(true);
    let driveBackupCleanupSkipped = false;
    try {
      // Remove accessible private Drive snapshots before deleting the server account.
      // If Drive cleanup fails with a cached token, stop so the user can retry.
      if (isGoogleDrivePrivateDataAvailable()) {
        const accessToken = await getPrivateDataAccessToken(user.id);
        if (accessToken) {
          await Promise.all([
            deleteGoogleDrivePrivateSnapshot(accessToken, user.id, journalPrivateEntryStore),
            deleteGoogleDrivePrivateSnapshot(accessToken, user.id, journalPrivateFolderStore),
            deleteGoogleDrivePrivateSnapshot(accessToken, user.id, journalPrivateMemoryStore),
          ]);
        } else {
          // Without a cached token, Drive backups cannot be checked or removed.
          driveBackupCleanupSkipped = true;
        }
      }

      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;

      // Remove this account's private Journal snapshots from this device.
      for (const type of ['entries', 'folders', 'memories'] as const) {
        localStorage.removeItem(journalPrivateLocalKey(user.id, type));
      }

      await signOut();
      if (driveBackupCleanupSkipped) {
        toast.warning('Account deleted, but Google Drive backup cleanup could not be verified. Check the Google account used for Journal sync.');
      } else {
        toast.success('Account and accessible private Journal backups deleted.');
      }
      navigate('/');
    } catch (error) {
      console.error('Account deletion failed', error);
      toast.error('Could not complete account deletion. Check your connection and try again.');
      setDeleting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-6">Security & Privacy</h1>

      <div className="-mx-5"><Enable2FAPrompt /></div>



      {/* ─── Account Security ─── */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Account Security</h3>
      <div className="glass rounded-card overflow-hidden shadow-card p-4 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Change Password</p>
            <p className="text-caption text-muted-foreground">10+ chars · upper, lower, number, symbol</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <Input
            type={showPwd ? 'text' : 'password'} value={currentPwd}
            onChange={e => setCurrentPwd(e.target.value)} placeholder="Current password"
            className="bg-card border-border rounded-input h-11" autoComplete="current-password"
          />
          <div className="relative">
            <Input
              type={showPwd ? 'text' : 'password'} value={newPwd}
              onChange={e => setNewPwd(e.target.value)} placeholder="New password"
              className="pr-11 bg-card border-border rounded-input h-11" autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPwd(s => !s)}
              aria-label={showPwd ? 'Hide passwords' : 'Show passwords'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Input
            type={showPwd ? 'text' : 'password'} value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)} placeholder="Confirm new password"
            className="bg-card border-border rounded-input h-11" autoComplete="new-password"
          />
          {pwdError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {pwdError}
            </p>
          )}
          <Button type="submit" disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
            className="w-full h-11 rounded-btn gradient-primary text-white font-semibold">
            {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
          </Button>
        </form>
      </div>

      {/* ─── Two-Factor Authentication ─── */}
      <div className="glass rounded-card overflow-hidden shadow-card p-4 mb-7">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${mfaEnrolled ? 'bg-emerald-500/15' : 'bg-primary/10'}`}>
            <ShieldCheck className={`w-[18px] h-[18px] ${mfaEnrolled ? 'text-emerald-500' : 'text-primary'}`} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Two-Factor Authentication (2FA)</p>
            <p className="text-caption text-muted-foreground">
              {mfaLoading ? 'Checking…' : mfaEnrolled ? '✓ Enabled — extra protection on sign-in' : 'Add an authenticator app (Google, Authy, 1Password)'}
            </p>
          </div>
        </div>

        {!mfaLoading && !mfaEnrolled && (
          <Button onClick={startEnroll} disabled={enrolling}
            className="w-full h-11 rounded-btn gradient-primary text-white font-semibold">
            {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Smartphone className="w-4 h-4 mr-2" />Enable 2FA</>)}
          </Button>
        )}

        {!mfaLoading && mfaEnrolled && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Keep access to your authenticator app, or add a second verified authenticator
              factor before replacing your current device.
            </p>
            <Button variant="outline" className="w-full h-11 rounded-btn text-destructive border-destructive/40"
              onClick={() => setDisableOpen(true)}>
              Disable 2FA
            </Button>
          </div>
        )}
      </div>

      {/* ─── Data Privacy ─── */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Data Privacy</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-4">
        <div className="flex items-center gap-3 p-4 border-b border-border/40">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Usage Analytics</p>
            <p className="text-caption text-muted-foreground">Allow anonymous data collection</p>
          </div>
          <Switch
            aria-label="Allow anonymous usage analytics"
            checked={dataTracking}
            onCheckedChange={handleDataTracking}
          />
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Personalization</p>
            <p className="text-caption text-muted-foreground">Tailored experience</p>
          </div>
          <Switch
            aria-label="Allow personalized coaching"
            checked={personalization}
            onCheckedChange={handlePersonalization}
          />
        </div>
        {adsSupported() && (
          <button
            type="button"
            onClick={handleAdPrivacy}
            disabled={adPrivacyBusy}
            className="w-full flex items-center gap-3 p-4 border-t border-border/40 hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              {adPrivacyBusy
                ? <Loader2 aria-hidden="true" className="w-[18px] h-[18px] text-primary animate-spin" />
                : <Shield aria-hidden="true" className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />}
            </div>
            <div className="flex-1">
              <p className="text-body font-medium text-foreground">Ad privacy choices</p>
              <p className="text-caption text-muted-foreground">Review or withdraw Google ad consent</p>
            </div>
            <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ─── Your Data ─── */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Your Data</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-4">
        <button onClick={handleExport} disabled={exporting}
          className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left border-b border-border/40">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <FileDown className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />}
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Export My Data</p>
            <p className="text-caption text-muted-foreground">Download profile & habits as JSON</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
        <button onClick={() => { setDeleteConfirm(''); setDeleteOpen(true); }}
          className="w-full flex items-center gap-3 p-4 hover:bg-destructive/5 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Trash2 className="w-[18px] h-[18px] text-destructive" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-destructive">Delete My Account</p>
            <p className="text-caption text-muted-foreground">Permanently erase everything</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* ─── Policies ─── */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Policies</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <button onClick={() => navigate('/privacy')}
          className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">Privacy Policy</p>
            <p className="text-caption text-muted-foreground">How we handle your data</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* ─── Enroll 2FA dialog ─── */}
      <AlertDialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <AlertDialogContent className="glass border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Set up 2FA
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-muted-foreground text-sm">
                <p>1. Open your authenticator app (Google Authenticator, Authy, 1Password).</p>
                <p>2. Scan the QR code or paste the secret key below.</p>
                {enrollQr && (
                  <div className="flex justify-center p-3 bg-white rounded-lg">
                    <img src={enrollQr} alt="2FA QR code" className="w-44 h-44" />
                  </div>
                )}
                {enrollSecret && (
                  <div className="bg-card rounded p-2 text-center font-mono text-xs break-all">
                    {enrollSecret}
                  </div>
                )}
                <p>3. Enter the 6-digit code from your app:</p>
                <Input value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="123456" inputMode="numeric" className="h-11 text-center font-mono text-lg tracking-widest" />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={verifyingOtp}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); verifyEnroll(); }}
              disabled={verifyingOtp || otpCode.length !== 6}
              className="gradient-primary text-white">
              {verifyingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Disable 2FA confirm ─── */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent className="glass border-destructive/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Disable 2FA?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your account will only require a password to sign in. You can re-enable 2FA at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep 2FA</AlertDialogCancel>
            <AlertDialogAction onClick={disable2FA}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete account ─── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="glass border-destructive/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" /> Delete Account
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-muted-foreground">
                <p>This will <strong className="text-destructive">permanently delete</strong> your account, habits, journal, friends, streaks, XP, and history.</p>
                <p className="text-sm">⚠️ This cannot be undone.</p>
                <p className="text-sm">
                  Deleting your account does not cancel a Google Play subscription.
                  To stop future charges, cancel it in{' '}
                  <a href="https://play.google.com/store/account/subscriptions"
                    target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Google Play subscriptions
                  </a>{' '}before deleting your account.
                </p>
                <p className="text-sm">Type <strong className="text-destructive">DELETE</strong> to confirm.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE" className="rounded-btn" autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              disabled={deleting || deleteConfirm.trim() !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting…' : 'Permanently Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

