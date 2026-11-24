import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Volume2, VolumeX, Bell, BellOff, Brain, Crown, HelpCircle, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { WINSTON_KEYS } from '@/hooks/useWinstonVoice';
import WinstonVoiceSettings from '@/components/WinstonVoiceSettings';

const COACHING_STYLES = [
  { id: 'motivational', label: 'Motivational', desc: 'Uplifting encouragement & positivity', emoji: '🔥' },
  { id: 'friendly', label: 'Friendly', desc: 'Warm, conversational guidance', emoji: '😊' },
  { id: 'strict', label: 'Strict', desc: 'Direct accountability & discipline', emoji: '💪' },
];

const MESSAGE_FREQUENCIES = [
  { id: 'minimal', label: 'Minimal', desc: 'Only essential check-ins' },
  { id: 'moderate', label: 'Moderate', desc: 'Balanced daily nudges' },
  { id: 'frequent', label: 'Frequent', desc: 'Regular motivation throughout the day' },
];

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-semibold text-body-lg text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ icon: Icon, iconColor, label, description, children }: {
  icon; iconColor?: string; label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-card p-4 flex items-center gap-3 mb-2 shadow-card">
      <Icon className={`w-5 h-5 ${iconColor || 'text-primary'} shrink-0`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-foreground">{label}</p>
        {description && <p className="text-caption text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function CoachSettings() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isPremium } = usePremium();
  const { user } = useAuth();

  // Preferences from localStorage
  const [winstonEnabled, setWinstonEnabled] = useState(() => localStorage.getItem('winston-enabled') !== 'false');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('winston-notifications') !== 'false');
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem(WINSTON_KEYS.voiceEnabled) !== 'false');
  
  const [coachingStyle, setCoachingStyle] = useState(() => localStorage.getItem('winston-coaching-style') || 'motivational');
  const [messageFrequency, setMessageFrequency] = useState(() => localStorage.getItem('winston-message-frequency') || 'moderate');
  const [personalization, setPersonalization] = useState(() => localStorage.getItem('winston-personalization') !== 'false');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  const persist = useCallback((key: string, value: string) => {
    localStorage.setItem(key, value);
  }, []);

  const handleToggle = (key: string, setter: (v: boolean) => void) => (checked: boolean) => {
    setter(checked);
    persist(key, String(checked));
  };

  const handleResetMemory = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Winston\'s memory has been cleared');
      setShowResetDialog(false);
    } catch {
      toast.error('Failed to reset memory. Try again.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-h1 text-foreground mb-1">Winston Settings</h1>
        <p className="text-caption text-muted-foreground mb-6">Customize your AI coaching experience</p>

        {/* Coach info card */}
        <div className="glass rounded-card p-4 mb-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
              <span className="text-3xl">🧠</span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-body text-foreground">Winston</p>
              <p className="text-caption text-muted-foreground">Premium Elite AI Coach</p>
            </div>
            {isPremium && (
              <span className="px-2 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-bold">ELITE</span>
            )}
          </div>
        </div>

        {/* General */}
        <SettingSection title="General">
          <SettingRow icon={Brain} label="Enable Winston" description="Turn AI coaching on or off">
            <Switch checked={winstonEnabled} onCheckedChange={handleToggle('winston-enabled', setWinstonEnabled)} />
          </SettingRow>
          <SettingRow icon={notificationsEnabled ? Bell : BellOff} iconColor={notificationsEnabled ? 'text-accent' : 'text-muted-foreground'} label="Motivational Notifications" description="Receive reminders and encouragement">
            <Switch checked={notificationsEnabled} onCheckedChange={handleToggle('winston-notifications', setNotificationsEnabled)} />
          </SettingRow>
        </SettingSection>

        {/* Voice tuning belongs in Winston settings, not Appearance */}
        <WinstonVoiceSettings />

        {/* Voice */}
        <SettingSection title="Voice Interaction">
          <SettingRow icon={voiceEnabled ? Volume2 : VolumeX} iconColor={voiceEnabled ? 'text-primary' : 'text-muted-foreground'} label="Voice Responses" description="Winston speaks responses aloud">
            <Switch checked={voiceEnabled} onCheckedChange={handleToggle(WINSTON_KEYS.voiceEnabled, setVoiceEnabled)} />
          </SettingRow>

        </SettingSection>

        {/* Coaching Style */}
        <SettingSection title="Coaching Style">
          <div className="space-y-2">
            {COACHING_STYLES.map(style => (
              <button
                key={style.id}
                onClick={() => { setCoachingStyle(style.id); persist('winston-coaching-style', style.id); }}
                className={`w-full glass rounded-card p-4 flex items-center gap-3 text-left transition-all ${
                  coachingStyle === style.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-secondary/50'
                }`}
              >
                <span className="text-xl">{style.emoji}</span>
                <div className="flex-1">
                  <p className="font-medium text-body text-foreground">{style.label}</p>
                  <p className="text-caption text-muted-foreground">{style.desc}</p>
                </div>
                {coachingStyle === style.id && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </SettingSection>

        {/* Message Frequency */}
        <SettingSection title="Message Frequency">
          <div className="space-y-2">
            {MESSAGE_FREQUENCIES.map(freq => (
              <button
                key={freq.id}
                onClick={() => { setMessageFrequency(freq.id); persist('winston-message-frequency', freq.id); }}
                className={`w-full glass rounded-card p-4 flex items-center gap-3 text-left transition-all ${
                  messageFrequency === freq.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-secondary/50'
                }`}
              >
                <MessageSquare className={`w-4 h-4 ${messageFrequency === freq.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <p className="font-medium text-body text-foreground">{freq.label}</p>
                  <p className="text-caption text-muted-foreground">{freq.desc}</p>
                </div>
                {messageFrequency === freq.id && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </SettingSection>

        {/* Personalization */}
        <SettingSection title="Intelligence">
          <SettingRow icon={Sparkles} iconColor="text-accent" label="Adaptive Personalization" description="Allow Winston to learn from your habits and behavior">
            <Switch checked={personalization} onCheckedChange={handleToggle('winston-personalization', setPersonalization)} />
          </SettingRow>
        </SettingSection>

        {/* Winston Data */}
        <SettingSection title="Winston Data">
          <SettingRow icon={Trash2} iconColor="text-destructive" label="Reset Winston's Memory" description="Clear all conversation history">
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowResetDialog(true)}>
              Reset
            </Button>
          </SettingRow>
        </SettingSection>

        {/* Subscription Status */}
        <SettingSection title="Subscription">
          <div className="glass rounded-card p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <Crown className={`w-5 h-5 ${isPremium ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1">
                <p className="font-bold text-body text-foreground">{isPremium ? 'Premium Elite Coach' : 'Free Plan'}</p>
                <p className="text-caption text-muted-foreground">
                  {isPremium ? 'Unlimited AI coaching, voice, and personalization' : 'Limited to 5 AI messages per day'}
                </p>
              </div>
            </div>
            {!isPremium && (
              <Button onClick={() => navigate('/pricing')} className="w-full gradient-primary text-white">
                <Crown className="w-4 h-4 mr-2" /> Upgrade to Premium
              </Button>
            )}
          </div>
        </SettingSection>

        {/* Help */}
        <SettingSection title="Help & Support">
          <SettingRow icon={HelpCircle} label="Get Help" description="FAQs, tips, and support">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings/feedback')}>
              Contact
            </Button>
          </SettingRow>
        </SettingSection>
      </motion.div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Winston's Memory?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your conversation history with Winston. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetMemory} disabled={resetting}>
              {resetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Reset Memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
