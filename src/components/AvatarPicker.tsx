import { useState, useRef, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Wand2, Upload, Loader2, Sparkles, Crown, UserRound, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { activeBackend } from '@/integrations/supabase/backendConfig';
import { AVATAR_STYLES, AVATAR_GENDERS, AVATAR_AGES, FREE_AVATAR_LIMIT, PREMIUM_AVATAR_LIMIT } from '../../supabase/functions/generate-avatar/specification';
import { PRESET_AGES, PRESET_AVATARS, presetsForAge, isPresetAvatarUrl, type PresetAgeKey } from '../../supabase/functions/generate-avatar/presets';
import { AVATAR_SERVICE_BREAK_MESSAGE, isAvatarProviderUnavailable } from '@/lib/avatarServiceErrors';
import { getLevelFromXP } from '@/lib/progression';
import AvatarProfilePreview from '@/components/AvatarProfilePreview';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

const AI_OPTIONS = {
  gender: AVATAR_GENDERS,
  ageRange: AVATAR_AGES,
  style: Object.keys(AVATAR_STYLES),
};
const FREE_DAILY_LIMIT = FREE_AVATAR_LIMIT;
const PREMIUM_DAILY_LIMIT = PREMIUM_AVATAR_LIMIT;

export default function AvatarPicker({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { isPremium } = usePremium();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'presets' | 'upload' | 'ai'>('presets');
  const [presetAge, setPresetAge] = useState<PresetAgeKey | 'all'>('all');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  // True once the user has tapped a preset this session, so the preview can
  // tell "your current avatar" apart from "the one you just picked".
  const [previewDirty, setPreviewDirty] = useState(false);
  const visiblePresets = useMemo(() => presetsForAge(presetAge), [presetAge]);
  // The preview follows the tap: the selected avatar, or the current one before
  // anything is picked. Nothing is saved from here.
  const currentAvatarUrl = visibleAvatarUrl(profile?.avatar_url);
  const previewUrl = selectedPreset ?? currentAvatarUrl;
  const previewPreset = useMemo(
    () => PRESET_AVATARS.find(preset => preset.url === previewUrl) ?? null,
    [previewUrl],
  );
  const previewCaption = !previewDirty
    ? (currentAvatarUrl ? 'Your current avatar' : null)
    : previewPreset?.label ?? null;
  const previewLevel = getLevelFromXP(profile?.xp || 0).level;
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiGender, setAiGender] = useState('Surprise me');
  const [aiAge, setAiAge] = useState('Young Adult');
  const [aiStyle, setAiStyle] = useState('Funky & Colorful');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const generatingRef = useRef(false);
  const pendingRequest = useRef<{ id: string; preferences: string } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [serverCreditLimit, setServerCreditLimit] = useState<number | null>(null);
  // Set when the AI provider is out of credit/rate limited, so the presets tab
  // can explain the switch. The avatar is left unchanged; there is no fallback.
  const [aiOnBreak, setAiOnBreak] = useState(false);

  // If the backend disagrees with cached Premium status, refresh the account and
  // temporarily display the server-authoritative avatar limit.
  useEffect(() => {
    if (profile && serverCreditLimit !== null) {
      const profileLimit = isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
      if (profileLimit === serverCreditLimit) setServerCreditLimit(null);
    }
  }, [profile?.is_premium, profile?.premium_until, profile?.trial_started_at, isPremium, serverCreditLimit]);

  // Compute remaining credits client-side (server is source of truth)
  const { creditsUsed, creditsLimit, creditsLeft } = useMemo(() => {
    const limit = serverCreditLimit ?? (isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT);
    const resetAt = profile?.ai_avatar_credits_reset_at ? new Date(profile.ai_avatar_credits_reset_at) : null;
    const hoursSince = resetAt ? (Date.now() - resetAt.getTime()) / (1000 * 60 * 60) : 999;
    const used = hoursSince >= 24 ? 0 : (profile?.ai_avatar_credits_used ?? 0);
    return { creditsUsed: used, creditsLimit: limit, creditsLeft: Math.max(0, limit - used) };
  }, [profile?.ai_avatar_credits_used, profile?.ai_avatar_credits_reset_at, isPremium, serverCreditLimit]);

  const noCreditsLeft = creditsLeft <= 0;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      // The avatars bucket is private (no anonymous internet reads), so use a
      // long-lived signed URL instead of a public URL.
      const { data: signed, error: signErr } = await supabase.storage
        .from('avatars')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signErr || !signed?.signedUrl) throw signErr || new Error('Could not sign avatar URL');
      await updateProfile({ avatar_url: signed.signedUrl });

      toast.success('Avatar updated!');
      setOpen(false);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const generateAI = async () => {
    if (!user || generatingRef.current || uploading) return;
    if (noCreditsLeft) {
      toast.error("You've used all your AI credits today. Try uploading a photo instead.");
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    const preferences = { gender: aiGender, ageRange: aiAge, style: aiStyle };
    const preferencesKey = JSON.stringify(preferences);
    if (!pendingRequest.current || pendingRequest.current.preferences !== preferencesKey) {
      pendingRequest.current = { id: crypto.randomUUID(), preferences: preferencesKey };
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in again to generate an avatar.'); return; }
      const resp = await fetch(`${activeBackend.url}/functions/v1/generate-avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: activeBackend.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...preferences, requestId: pendingRequest.current.id }),
      });

      const payload = await resp.json().catch(() => ({}));

      if (payload?.code !== 'CONFIRMATION_INTERRUPTED' && payload?.code !== 'IN_PROGRESS') {
        pendingRequest.current = null;
      }
      if (isAvatarProviderUnavailable(resp.status, payload)) {
        // Provider out of credit / rate limited / billing: never show provider
        // details. Send the user to the presets, which need no AI credits.
        setAiOnBreak(true);
        setTab('presets');
        toast.info(AVATAR_SERVICE_BREAK_MESSAGE);
        return;
      }
      if (!resp.ok) {
        if (resp.status === 401) {
          toast.error('Please sign in again to generate an avatar.');
        } else {
          toast.error(payload?.error || 'Failed to generate avatar');
        }
        return;
      }

      if (payload?.code === 'DAILY_LIMIT_REACHED') {
        const serverLimit = typeof payload.creditsLimit === 'number' ? payload.creditsLimit : (isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT);
        const serverUsed = typeof payload.creditsUsed === 'number' ? payload.creditsUsed : serverLimit;
        setServerCreditLimit(serverLimit);
        queryClient.setQueryData(['profile', user.id], (prev: any) =>
          prev ? { ...prev, ai_avatar_credits_used: serverUsed, ai_avatar_credits_reset_at: payload.resetAt ?? prev.ai_avatar_credits_reset_at } : prev
        );
        // Refresh server-owned plan state so stale Premium cache cannot show
        // 24/30 credits while the backend enforces the free allowance.
        await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
        toast.error(serverLimit < PREMIUM_DAILY_LIMIT && isPremium
          ? 'Your plan status was out of date. Your account currently has the free avatar limit; we refreshed your account details.'
          : (payload.error || "You've used all your AI credits today."));
        return;
      }

      if (payload?.code === 'SERVICE_UNAVAILABLE') {
        toast.error(payload.error || 'AI service unavailable. Try uploading a photo.');
        return;
      }

      if (payload?.code === 'RATE_LIMITED') {
        toast.error(payload.error || 'Too many requests. Please wait a moment.');
        return;
      }

      if (typeof payload?.url === 'string' && payload.url.startsWith(`${activeBackend.url}/storage/v1/object/sign/avatars/`)) {
        setPreviewReady(false);
        setPreviewFailed(false);
        setGeneratedUrl(payload.url);
        // Update credits in cache directly — NO invalidate/refetch (avoids racing the avatar save)
        if (typeof payload.creditsUsed === 'number' && payload.resetAt) {
          queryClient.setQueryData(['profile', user.id], (prev: any) =>
            prev ? { ...prev, ai_avatar_credits_used: payload.creditsUsed, ai_avatar_credits_reset_at: payload.resetAt } : prev
          );
        }

      } else {
        toast.error(payload?.error || 'No image returned');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to generate avatar');
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const applyingRef = useRef(false);

  const applyAvatar = async (url: string, attempt = 1): Promise<void> => {
    if (!user) return;
    // Hard synchronous lock — blocks overlapping calls even before state flushes
    if (applyingRef.current) return;
    applyingRef.current = true;
    setUploading(true);
    try {
      await queryClient.cancelQueries({ queryKey: ['profile', user.id] });
      await updateProfile({ avatar_url: url });
      await queryClient.refetchQueries({ queryKey: ['profile', user.id], exact: true });
      toast.success('✨ Avatar applied! Your new profile picture is live.', { duration: 3500 });
      setOpen(false);
    } catch (err) {
      const MAX_ATTEMPTS = 3;
      if (attempt < MAX_ATTEMPTS) {
        // Auto-retry with small backoff
        applyingRef.current = false;
        setUploading(false);
        await new Promise(r => setTimeout(r, 400 * attempt));
        return applyAvatar(url, attempt + 1);
      }
      // Final failure — show manual retry action
      toast.error('Failed to save avatar.', {
        description: err?.message || 'Check your connection and try again.',
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => { applyAvatar(url, 1); },
        },
      });
    } finally {
      applyingRef.current = false;
      setUploading(false);
    }
  };

  // Each time the dialog opens, AI generation gets a fresh chance.
  useEffect(() => {
    if (open) setAiOnBreak(false);
  }, [open]);

  // Start the preset grid on the user's current preset, if they already have one.
  useEffect(() => {
    if (open) {
      setSelectedPreset(isPresetAvatarUrl(profile?.avatar_url) ? profile?.avatar_url ?? null : null);
      setPreviewDirty(false);
    }
  }, [open, profile?.avatar_url]);

  const usePresetAvatar = () => {
    if (!selectedPreset || !isPresetAvatarUrl(selectedPreset) || selectedPreset === profile?.avatar_url || uploading || applyingRef.current) return;
    applyAvatar(selectedPreset, 1);
  };

  const useGeneratedAvatar = () => {
    if (!generatedUrl || !previewReady || previewFailed || uploading || applyingRef.current) return;
    applyAvatar(generatedUrl, 1);
  };




  const tabs = [
    { key: 'presets' as const, label: 'Avatars', icon: UserRound },
    { key: 'upload' as const, label: 'Upload', icon: Upload },
    { key: 'ai' as const, label: 'AI Generate', icon: Wand2 },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <span className="inline-flex">{children}</span>
      </DialogTrigger>
      <DialogContent className="bg-card border-border rounded-card box-border flex w-[calc(100vw-1.5rem)] max-w-md max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">Change Avatar</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            Pick an avatar, upload a photo or generate a profile image.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary rounded-btn p-1">
          {tabs.map(t => (
            <Button type="button" variant="ghost" key={t.key} onClick={() => setTab(t.key)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-btn text-caption font-medium transition-all ${tab === t.key ? 'bg-card shadow-card text-foreground' : 'text-muted-foreground'}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </Button>
          ))}
        </div>

        <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleUpload} />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
        {tab === 'presets' && (
          <div className="space-y-3 py-2">
            <div className="sticky top-0 z-10 bg-card pb-2">
              <AvatarProfilePreview
                url={previewUrl}
                name={profile?.name || 'Hero'}
                level={previewLevel}
                isPremium={isPremium}
                caption={previewCaption}
              />
            </div>
            {aiOnBreak && (
              <div role="status" className="rounded-btn border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-caption text-foreground">{AVATAR_SERVICE_BREAK_MESSAGE}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter avatars by age">
              {[{ key: 'all' as const, label: 'All' }, ...PRESET_AGES].map(a => (
                <Button type="button" variant="ghost" key={a.key} aria-pressed={presetAge === a.key} onClick={() => setPresetAge(a.key)} className={`px-3 py-1.5 h-auto rounded-btn text-caption font-medium transition-all ${presetAge === a.key ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>{a.label}</Button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {visiblePresets.map(preset => {
                const selected = selectedPreset === preset.url;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    aria-label={preset.label}
                    aria-pressed={selected}
                    disabled={uploading}
                    onClick={() => { setSelectedPreset(preset.url); setPreviewDirty(true); }}
                    className={`relative aspect-square rounded-full overflow-hidden border-2 bg-secondary transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'}`}
                  >
                    <img src={preset.url} alt="" width={80} height={80} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    {selected && (
                      <span className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full gradient-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div className="space-y-4 py-2">
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full glass rounded-card p-8 flex flex-col items-center gap-3 hover:border-primary/40 transition-all active:scale-[0.98]">
              {uploading ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <Camera className="w-8 h-8 text-primary" />}
              <span className="text-body font-medium">{uploading ? 'Uploading...' : 'Choose from gallery'}</span>
              <span className="text-caption text-muted-foreground">JPG, PNG up to 5MB</span>
            </Button>
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-4 py-2">
            {/* Credits banner */}
            <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-btn border ${noCreditsLeft ? 'bg-destructive/10 border-destructive/30' : 'bg-primary/5 border-primary/20'}`}>
              <div className="flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${noCreditsLeft ? 'text-destructive' : 'text-primary'}`} />
                <span className="text-caption font-medium text-foreground">
                  AI Credits: {creditsLeft}/{creditsLimit} left
                </span>
              </div>
              {!isPremium && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Free plan</span>
              )}
            </div>

            {noCreditsLeft && (
              <div className="rounded-btn bg-secondary/60 p-3 space-y-2">
                <p className="text-caption text-foreground">
                  You've used all {isPremium ? '' : 'free '}credits today. Try again tomorrow{!isPremium ? ' or upgrade for more daily generations.' : '.'}
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => setTab('upload')} variant="secondary" size="sm" className="flex-1 rounded-btn">
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload photo
                  </Button>
                  {!isPremium && (
                    <Button
                      onClick={() => { setOpen(false); navigate('/pricing'); }}
                      size="sm"
                      className="flex-1 gradient-primary text-primary-foreground rounded-btn"
                    >
                      <Crown className="w-3.5 h-3.5 mr-1.5" /> Upgrade
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="text-caption text-muted-foreground mb-2">Gender</p>
              <div className="grid grid-cols-3 gap-2">
                {AI_OPTIONS.gender.map(g => (
                  <Button type="button" variant="ghost" key={g} disabled={generating} aria-pressed={aiGender === g} onClick={() => setAiGender(g)} className={`min-w-0 whitespace-normal px-2 py-2 rounded-btn text-caption font-medium transition-all ${aiGender === g ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>{g}</Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-caption text-muted-foreground mb-2">Age Range</p>
              <div className="flex flex-wrap gap-2">
                {AI_OPTIONS.ageRange.map(a => (
                  <Button type="button" variant="ghost" key={a} disabled={generating} aria-pressed={aiAge === a} onClick={() => setAiAge(a)} className={`px-3 py-1.5 rounded-btn text-caption font-medium transition-all ${aiAge === a ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>{a}</Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-caption text-muted-foreground mb-2">Style</p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto overscroll-contain pb-2 pr-1">
                {AI_OPTIONS.style.map(s => (
                  <Button type="button" variant="ghost" key={s} disabled={generating} aria-pressed={aiStyle === s} onClick={() => setAiStyle(s)} className={`w-full min-h-10 whitespace-normal px-2 py-2 rounded-btn text-[11px] leading-tight font-medium transition-all ${aiStyle === s ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>{s}</Button>
                ))}
              </div>
            </div>

            {generatedUrl && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-56 h-56 max-w-[72vw] max-h-[72vw] shrink-0 rounded-full overflow-hidden border-2 border-primary shadow-card">
                  <img loading="eager" decoding="async" src={generatedUrl} alt="AI Avatar" className="w-full h-full object-cover" onLoad={() => { setPreviewReady(true); toast.success("Avatar created! Review it and select Use this avatar when you are ready."); }} onError={() => { setPreviewFailed(true); toast.error('Avatar preview could not load. Check your connection before applying it.'); }} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={generateAI} variant="secondary" size="sm" className="rounded-btn" disabled={generating || uploading || noCreditsLeft}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Regenerate'}
                  </Button>
                  <Button
                    onClick={useGeneratedAvatar}
                    size="sm"
                    className="gradient-primary text-primary-foreground rounded-btn min-w-[140px]"
                    disabled={uploading || generating || !previewReady || previewFailed}
                    aria-busy={uploading}
                  >
                    {uploading ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-4 h-4 animate-spin" /> Applying…
                      </span>
                    ) : (
                      'Use this avatar'
                    )}
                  </Button>
                </div>

              </div>
            )}

            {generating && generatedUrl && <p role="status" className="text-center text-caption text-muted-foreground">Creating a new variation…</p>}

            {!generatedUrl && (
              <Button
                onClick={generateAI}
                disabled={generating || uploading || noCreditsLeft}
                className="w-full gradient-accent text-primary-foreground rounded-btn h-11 font-semibold disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Creating your identity…</span>
                ) : noCreditsLeft ? (
                  <span className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> No credits left today</span>
                ) : (
                  <span className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Generate AI Avatar</span>
                )}
              </Button>
            )}

            {!isPremium && !noCreditsLeft && (
              <button
                onClick={() => { setOpen(false); navigate('/pricing'); }}
                className="w-full text-center text-caption text-muted-foreground hover:text-primary transition-colors"
              >
                <Crown className="w-3 h-3 inline mr-1" />
                Upgrade for {PREMIUM_DAILY_LIMIT} AI avatars per day
              </button>
            )}
          </div>
        )}
        </div>

        {tab === 'presets' && (
          <Button
            type="button"
            onClick={usePresetAvatar}
            disabled={!selectedPreset || selectedPreset === profile?.avatar_url || uploading}
            aria-busy={uploading}
            className="w-full gradient-primary text-primary-foreground rounded-btn h-11 font-semibold disabled:opacity-50"
          >
            {uploading ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Applying…</span>
            ) : selectedPreset && selectedPreset === profile?.avatar_url ? 'Current avatar' : 'Use this avatar'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
