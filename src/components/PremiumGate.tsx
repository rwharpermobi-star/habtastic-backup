import { usePremium } from '@/hooks/usePremium';
import LockedFeatureCard from '@/components/LockedFeatureCard';
import { FEATURE_LABELS, type Feature } from '@/lib/featureGating';

interface PremiumGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

export default function PremiumGate({ feature, children, fallbackTitle, fallbackDescription }: PremiumGateProps) {
  const { canAccess } = usePremium();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  const label = FEATURE_LABELS[feature];
  return (
    <LockedFeatureCard
      title={fallbackTitle || label.title}
      description={fallbackDescription || label.description}
      icon={<span className="text-lg">{label.icon}</span>}
    >
      {children}
    </LockedFeatureCard>
  );
}
