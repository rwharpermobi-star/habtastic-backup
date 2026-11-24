import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Crown, Sparkles } from 'lucide-react';
import { usePremium } from '@/hooks/usePremium';

interface UpsellTooltipProps {
  /** Short feature name shown in the tooltip header */
  feature: string;
  /** Body description of what the user unlocks */
  description: string;
  children: ReactNode;
  /** Override navigation target (defaults to /pricing) */
  ctaHref?: string;
  /** Hide tooltip entirely when user is already premium */
  hideWhenPremium?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Contextual tooltip used to explain why a feature is premium-only and
 * route users to the pricing page. Tap-friendly on mobile via long-press.
 */
export default function UpsellTooltip({
  feature,
  description,
  children,
  ctaHref = '/pricing',
  hideWhenPremium = true,
  side = 'top',
}: UpsellTooltipProps) {
  const navigate = useNavigate();
  const { isPremium } = usePremium();

  if (hideWhenPremium && isPremium) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[240px] p-3 bg-popover border border-primary/30 shadow-xl"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Crown className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-bold text-foreground">{feature} · Premium</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            {description}
          </p>
          <button
            onClick={() => navigate(ctaHref)}
            className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-btn gradient-primary text-primary-foreground text-[11px] font-bold"
          >
            <Sparkles className="w-3 h-3" /> Unlock with Premium
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
