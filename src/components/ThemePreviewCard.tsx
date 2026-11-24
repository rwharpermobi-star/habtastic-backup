import { motion } from 'framer-motion';
import { Check, Moon, Sun } from 'lucide-react';

interface Props {
  variant: 'light' | 'dark';
  selected: boolean;
  onSelect: () => void;
}

/**
 * Visual preview swatch for Arctic Mint (light) and Midnight Navy (dark).
 * Used in onboarding theme picker and Appearance settings.
 */
export default function ThemePreviewCard({ variant, selected, onSelect }: Props) {
  const isDark = variant === 'dark';
  const title = isDark ? 'Midnight Navy' : 'Arctic Mint';
  const subtitle = isDark ? 'Deep navy + glowing mint' : 'Icy mint + deep teal';

  return (
    <motion.button
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
      className={`relative w-full rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
        selected
          ? 'border-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.5)]'
          : 'border-border/40 hover:border-primary/40'
      }`}
    >
      {/* Preview surface — uses inline colors so it ALWAYS shows the target theme */}
      <div
        className="relative h-40 p-4 flex flex-col justify-between"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at top, hsl(172 76% 50% / 0.18), transparent 60%), hsl(220 50% 8%)'
            : 'radial-gradient(ellipse at top, hsl(174 86% 38% / 0.15), transparent 60%), hsl(156 56% 96%)',
        }}
      >
        {/* Faux header */}
        <div className="flex items-center justify-between">
          <div
            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{
              background: isDark ? 'hsl(220 38% 13%)' : 'hsl(0 0% 100%)',
              color: isDark ? 'hsl(156 30% 96%)' : 'hsl(200 50% 8%)',
            }}
          >
            HabTastic
          </div>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: isDark ? 'hsl(172 76% 50%)' : 'hsl(174 86% 38%)',
              color: isDark ? 'hsl(220 50% 8%)' : '#fff',
            }}
          >
            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Faux card with progress */}
        <div
          className="rounded-xl p-3 space-y-2"
          style={{
            background: isDark ? 'hsl(220 38% 13%)' : 'hsl(0 0% 100%)',
            boxShadow: isDark
              ? '0 4px 16px rgba(0,0,0,0.3)'
              : '0 4px 16px hsl(200 50% 8% / 0.06)',
          }}
        >
          <div
            className="h-2 rounded-full"
            style={{ background: isDark ? 'hsl(220 25% 18%)' : 'hsl(156 40% 93%)' }}
          >
            <div
              className="h-full rounded-full w-3/4"
              style={{
                background: isDark
                  ? 'linear-gradient(90deg, hsl(172 76% 50%), hsl(175 80% 52%))'
                  : 'linear-gradient(90deg, hsl(174 86% 38%), hsl(175 95% 43%))',
              }}
            />
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background:
                    i <= 3
                      ? isDark
                        ? 'hsl(172 76% 50%)'
                        : 'hsl(174 86% 38%)'
                      : isDark
                      ? 'hsl(220 25% 18%)'
                      : 'hsl(156 40% 93%)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="p-3 bg-card text-left">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-foreground">{title}</p>
          {selected && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
        </div>
        <p className="text-caption text-muted-foreground">{subtitle}</p>
      </div>
    </motion.button>
  );
}
