import { memo, useCallback } from 'react';
import { Home, CheckSquare, BarChart3, Crown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playNavigate } from '@/lib/sfx';
import { usePremium } from '@/hooks/usePremium';
import { useAds } from '@/hooks/useAds';
import { useWebAds } from '@/hooks/useWebAds';
import AdConsentHost from '@/components/AdConsentHost';

// Interstitials only get a chance to appear after a deliberate tab change.
// adService enforces placement rules, the 7-minute cooldown and 15/day cap.
const INTERSTITIAL_NAV_CHANCE = 0.5;

// SVG animated sound-wave icon for Winston
function WinstonIcon({ active }: { active: boolean }) {
  const color = active ? 'hsl(var(--primary))' : 'currentColor';
  const bars = [
    { x: 10, h: 16, y: 24 },
    { x: 20, h: 28, y: 18 },
    { x: 30, h: 40, y: 12 },
    { x: 40, h: 28, y: 18 },
    { x: 50, h: 16, y: 24 },
  ];

  return (
    <svg width={20} height={20} viewBox="0 0 64 64" fill="none">
      {bars.map(({ x, h, y }, i) => (
        <rect key={i} x={x} y={y} width="4" height={h} rx="2" fill={color}>
          <animate attributeName="height" values={`${h};${h + 12};${h}`} dur={active ? '0.8s' : '2s'} repeatCount="indefinite" />
          <animate attributeName="y" values={`${y};${y - 6};${y}`} dur={active ? '0.8s' : '2s'} repeatCount="indefinite" />
        </rect>
      ))}
    </svg>
  );
}

const NAV_ITEMS = [
  { path: '/', icon: Home, key: 'home' as const },
  { path: '/habits', icon: CheckSquare, key: 'habits' as const },
  { path: '/progress', icon: BarChart3, key: 'progress' as const },
  { path: '/coach', icon: null, key: 'winston' as const },
  { path: '/pricing', icon: Crown, key: 'premium' as const },
];

const preloadMap: Record<string, () => void> = {
  '/': () => import('@/pages/Dashboard'),
  '/habits': () => import('@/pages/Habits'),
  '/progress': () => import('@/pages/Progress'),
  '/coach': () => import('@/pages/Coach'),
  '/pricing': () => import('@/pages/Pricing'),
};

const BottomNav = memo(function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isPremium } = usePremium();
  const { showInterstitial } = useAds();

  useWebAds(!isPremium);

  const handleNav = useCallback((path: string) => {
    if (location.pathname === path) return;

    playNavigate();
    navigate(path);

    // Random chance after the tab change has completed. The ad layer skips
    // core screens (home, habits, Winston, Premium), open dialogs, the first
    // minute after launch, Premium users, no-fill and the cooldown/daily cap.
    if (Math.random() < INTERSTITIAL_NAV_CHANCE) {
      window.setTimeout(() => {
        void showInterstitial();
      }, 450);
    }
  }, [location.pathname, navigate, showInterstitial]);

  const handlePreload = useCallback((path: string) => {
    preloadMap[path]?.();
  }, []);

  return (
    <>
    <AdConsentHost />
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-primary/10">
      <div className="flex items-center justify-around py-2 px-1 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, key }) => {
          const active = location.pathname === path;
          const showPremiumDot = path === '/pricing' && !isPremium && !active;
          const label = t(`nav.${key}`);
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              onPointerEnter={() => handlePreload(path)}
              aria-label={path === '/pricing' && !isPremium ? `${label} — upgrade available` : label}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-btn transition-all duration-200 active:scale-90 ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {Icon ? (
                <Icon className={`w-5 h-5 ${active ? 'scale-110' : ''} transition-transform`} strokeWidth={active ? 2 : 1.5} />
              ) : (
                <WinstonIcon active={active} />
              )}
              <span className="text-[10px] font-medium">{label}</span>
              {showPremiumDot && (
                <span
                  aria-hidden
                  className="absolute top-1 right-2 w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent))] animate-pulse"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
});

export default BottomNav;
