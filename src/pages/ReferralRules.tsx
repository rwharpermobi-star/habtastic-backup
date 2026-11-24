import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ShieldCheck,
  Gift,
  AlertTriangle,
  Sparkles,
  Scale,
  LifeBuoy,
  Crown,
  Trophy,
  Calendar,
  Download,
  Mail,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useReferral } from '@/hooks/useReferral';

interface Section {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

type ReferralRewardSettings = { signupXpBonus: number; signupPointsBonus: number; retentionXpBonus: number };

type ReferralMilestone = {
  count: number;
  bonusDays: number;
  lifetime?: boolean;
  bonusXP: number;
  bonusCoins: number;
  emoji?: string;
  label?: string;
};

const timeline = [
  {
    when: 'At signup',
    title: 'A new user uses your Referral Code',
    detail: 'Referral codes are for newly registered accounts only. Existing accounts cannot claim signup referral rewards.',
    accent: 'text-primary',
    dot: 'bg-primary',
  },
  {
    when: 'On verified paid Premium upgrade',
    title: 'Referral becomes qualified',
    detail: 'A server-verified live Premium purchase counts toward the configured referral milestones.',
    accent: 'text-accent',
    dot: 'bg-accent',
  },
  {
    when: 'Configured milestones',
    title: 'Rewards are added once',
    detail: 'Premium days extend eligible timed Premium entitlements; existing indefinite Premium access is left unchanged. Any XP and points bonuses follow server-side configuration.',
    accent: 'text-primary',
    dot: 'bg-primary',
  },
];

function SectionCard({ icon, title, children }: Section) {
  return (
    <div className="glass rounded-card p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-2xl bg-primary/15 flex items-center justify-center text-primary">
          {icon}
        </div>
        <h2 className="font-semibold text-body-lg text-foreground">{title}</h2>
      </div>
      <div className="text-caption text-foreground/85 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

async function downloadRulesPdf(milestones: ReferralMilestone[], settings: ReferralRewardSettings) {
  try {
    const { default: JsPDF } = await import('jspdf');
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (lines: number, lineHeight = 14) => {
      if (y + lines * lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const writeHeading = (text: string, size = 16) => {
      ensureSpace(2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      doc.text(text, margin, y);
      y += size + 8;
    };

    const writeParagraph = (text: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(text, maxWidth);
      ensureSpace(lines.length);
      doc.text(lines, margin, y);
      y += lines.length * 14 + 6;
    };

    const writeBullets = (items: string[]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      items.forEach((it) => {
        const lines = doc.splitTextToSize(`• ${it}`, maxWidth - 12);
        ensureSpace(lines.length);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 4;
    };

    writeHeading('HabTastic AI Referral Program — Rules & Regulations', 18);
    writeParagraph(`Generated: ${new Date().toLocaleString()}`);
    writeParagraph('To ensure fairness for all HabTastic AI users, the following rules apply to the referral program.');

    writeHeading('Eligible Referrals');
    writeBullets([
      'Referrals must be new HabTastic AI users.',
      'Users must be newly registered and use your unique referral code or referral link within the signup claim window.',
      'Premium milestone progress is earned only from server-verified live paid Premium purchases.',
    ]);

    writeHeading('Reward Milestones');
    milestones.forEach((m) => {
      writeParagraph(`${m.count} Qualified Paid Referral${m.count === 1 ? '' : 's'}`);
      const rewards = [];
      if (m.lifetime) rewards.push('Lifetime Premium');
      else if (m.bonusDays > 0) rewards.push(`${m.bonusDays} Days Free Premium`);
      if (m.bonusXP > 0) rewards.push(`${m.bonusXP} Bonus XP`);
      if (m.bonusCoins > 0) rewards.push(`${m.bonusCoins} Referral Reward Points`);
      if (rewards.length === 0) rewards.push('No XP or points bonus currently enabled');
      writeBullets(rewards);
    });

    writeHeading('Reward Timeline');
    writeBullets(timeline.map((t) => `${t.when} — ${t.title}: ${t.detail}`));

    writeHeading('Important Rules');
    writeBullets([
      'Self-referrals are not allowed.',
      'Creating multiple accounts to earn rewards is prohibited.',
      'Only live, server-verified paid Premium referrals count toward Premium-day milestones.',
      'Friend Codes are a separate system and never grant referral rewards.',
      'Each milestone reward can be granted only once per referrer.',
      'HabTastic AI reserves the right to remove rewards obtained through fraudulent activity.',
      'Premium rewards from referrals are non-transferable and tied to the earning account.',
      'Referral rewards cannot be exchanged for cash.',
    ]);

    writeHeading('XP & Bonus Rewards');
    writeBullets([
      'Referral XP and reward-point amounts are controlled by server-side configuration.',
      `Signup bonus: ${settings.signupXpBonus} XP and ${settings.signupPointsBonus} reward points.`,
      `Optional 30-day retention XP bonus: ${settings.retentionXpBonus} (zero means disabled).`,
      milestones.some((m) => m.bonusXP > 0 || m.bonusCoins > 0)
        ? 'Configured milestone XP and points bonuses are listed with each milestone.'
        : 'Milestone XP and points bonuses are currently set to zero.',
      'Referral XP, when enabled, is awarded through HabTastic’s authoritative XP system.',
    ]);

    writeHeading('Fair Use Policy');
    writeParagraph(
      'Our goal is to reward genuine community growth. Users found abusing the referral system may have referral rewards revoked and referral privileges suspended.',
    );

    writeHeading('Need Help?');
    writeParagraph(
      'If you believe a referral was not tracked correctly, contact HabTastic AI Support through the app and include the email address of the referred user.',
    );

    doc.save('habtastic-referral-rules.pdf');
    toast.success('Rules PDF downloaded');
  } catch (e) {
    console.error('PDF generation failed', e);
    toast.error('Could not generate PDF');
  }
}

export default function ReferralRules() {
  const navigate = useNavigate();
  const { MILESTONES, signupXpBonus, signupPointsBonus, retentionXpBonus } = useReferral();
  const tiers = MILESTONES.map((m, index) => ({
    emoji: m.emoji || (index === 0 ? '🎁' : index === 1 ? '🚀' : '🏆'),
    title: `${m.count} Qualified Paid Referral${m.count === 1 ? '' : 's'}`,
    rewards: [
      ...(m.lifetime ? ['Lifetime Premium'] : m.bonusDays > 0 ? [`${m.bonusDays} Days Free Premium`] : []),
      ...(m.bonusXP > 0 ? [`${m.bonusXP} Bonus XP`] : []),
      ...(m.bonusCoins > 0 ? [`${m.bonusCoins} Referral Reward Points`] : []),
      ...(!m.lifetime && m.bonusDays <= 0 && m.bonusXP <= 0 && m.bonusCoins <= 0 ? ['No additional bonus currently enabled'] : []),
    ],
  }));
  const [referredEmail, setReferredEmail] = useState('');

  const openSupportWithEmail = () => {
    const trimmed = referredEmail.trim();
    if (!trimmed) {
      toast.error("Enter your friend's email so support can find the referral");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email');
      return;
    }
    const params = new URLSearchParams({
      category: 'Features & Programs',
      topic: 'Referral not tracked',
      referredEmail: trimmed,
    });
    navigate(`/settings/feedback/submit?${params.toString()}`);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-secondary/60 transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-h1 text-foreground">Program Rules</h1>
        </div>
        <button
          onClick={() => void downloadRulesPdf(MILESTONES, { signupXpBonus, signupPointsBonus, retentionXpBonus })}
          aria-label="Download rules as PDF"
          className="flex items-center gap-1.5 px-3 py-2 rounded-btn bg-secondary/60 hover:bg-secondary text-foreground text-caption font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          PDF
        </button>
      </div>

      <p className="text-body text-muted-foreground mb-5 leading-snug">
        To ensure fairness for all HabTastic AI users, the following rules apply to the referral program.
      </p>

      <div className="space-y-4">
        <SectionCard icon={<ShieldCheck className="w-4 h-4" />} title="Eligible Referrals">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Referrals must be new HabTastic AI users.</li>
            <li>Referral codes must be used within the configured signup claim window after registration.</li>
            <li>Premium milestone progress is earned only from server-verified live paid Premium purchases.</li>
            <li>Friend Codes are separate and never grant referral rewards or create friendships.</li>
          </ul>
        </SectionCard>

        <SectionCard icon={<Trophy className="w-4 h-4" />} title="Reward Milestones">
          <div className="space-y-3">
            {tiers.map((t) => (
              <div
                key={t.title}
                className="rounded-input border border-border/40 bg-secondary/30 p-3"
              >
                <p className="font-semibold text-body text-foreground mb-1.5">
                  <span className="mr-1.5">{t.emoji}</span> {t.title}
                </p>
                <ul className="space-y-1 pl-1">
                  {t.rewards.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-caption">
                      <Sparkles className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={<Calendar className="w-4 h-4" />} title="Reward Timeline">
          <p className="mb-3">
            Here's how referrals are verified and when configured rewards are credited.
          </p>
          <ol className="relative border-l-2 border-border/50 pl-4 space-y-4">
            {timeline.map((step, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full ring-4 ring-background ${step.dot}`}
                />
                <p className={`text-[11px] font-bold uppercase tracking-wider ${step.accent}`}>{step.when}</p>
                <p className="font-semibold text-body text-foreground mt-0.5">{step.title}</p>
                <p className="text-caption text-muted-foreground mt-0.5">{step.detail}</p>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard icon={<AlertTriangle className="w-4 h-4" />} title="Important Rules">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Self-referrals are not allowed.</li>
            <li>Existing accounts cannot claim signup rewards with a Referral Code.</li>
            <li>Creating multiple accounts to earn rewards is prohibited.</li>
            <li>Only live, server-verified paid Premium referrals count toward Premium-day milestones.</li>
            <li>Each Premium milestone reward can be granted only once per referrer.</li>
            <li>HabTastic AI reserves the right to remove rewards obtained through fraudulent activity.</li>
            <li>Premium rewards from referrals are non-transferable and tied to the earning account.</li>
            <li>Referral rewards cannot be exchanged for cash.</li>
          </ul>
        </SectionCard>

        <SectionCard icon={<Sparkles className="w-4 h-4" />} title="XP & Bonus Rewards">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Referral XP and reward-point bonuses are controlled by server-side configuration.</li>
            <li>Configured signup bonus: {signupXpBonus} XP and {signupPointsBonus} reward points.</li>
            <li>Optional 30-day retention XP bonus: {retentionXpBonus} (zero means disabled).</li>
            <li>{MILESTONES.some((m) => m.bonusXP > 0 || m.bonusCoins > 0) ? 'Configured milestone XP and points bonuses are shown with each milestone.' : 'Milestone XP and points bonuses are currently set to zero.'}</li>
            <li>When enabled, referral XP is awarded through HabTastic's authoritative XP system after backend verification.</li>
          </ul>
        </SectionCard>

        <SectionCard icon={<Scale className="w-4 h-4" />} title="Fair Use Policy">
          <p>
            Our goal is to reward genuine community growth. Users found abusing the referral system may have referral
            rewards revoked and referral privileges suspended.
          </p>
        </SectionCard>

        <SectionCard icon={<LifeBuoy className="w-4 h-4" />} title="Need Help?">
          <p>
            If a referral wasn't tracked correctly, enter your friend's email and we'll open the support form with it
            already filled in.
          </p>
          <div className="mt-3 space-y-2">
            <label htmlFor="referred-email" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Referred user's email
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="referred-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={referredEmail}
                  onChange={(e) => setReferredEmail(e.target.value)}
                  placeholder="friend@email.com"
                  className="pl-9 bg-background border-border rounded-input"
                />
              </div>
            </div>
            <Button
              onClick={openSupportWithEmail}
              className="w-full mt-1 gradient-primary text-primary-foreground rounded-btn h-11 font-semibold"
            >
              Open support form
            </Button>
          </div>
        </SectionCard>
      </div>

      <p className="text-[11px] text-muted-foreground text-center mt-6">
        HabTastic AI may update these rules at any time to protect the integrity of the program.
      </p>
    </motion.div>
  );
}
