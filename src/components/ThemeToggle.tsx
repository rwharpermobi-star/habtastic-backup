import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface Props {
  /** Compact icon-only button (default) or full pill switch */
  variant?: 'icon' | 'switch';
  className?: string;
}

/**
 * Polished theme toggle.
 *
 * - Choice persists via ThemeContext (localStorage + Supabase profile).
 * - Cross-fade between background/foreground tokens is handled globally
 *   in index.css (`* { transition: background-color, color, ... }`).
 * - Icon morph uses AnimatePresence for a clean rotate-and-fade swap.
 * - Fully accessible: real <button>, aria-pressed, focus-visible ring.
 */
export default function ThemeToggle({ variant = 'icon', className }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={toggleTheme}
        className={cn(
          'relative inline-flex items-center h-9 w-16 rounded-full p-1 transition-colors duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
          isDark ? 'bg-primary/20' : 'bg-secondary',
          className,
        )}
      >
        {/* Track icons */}
        <Sun
          className={cn(
            'absolute left-2 w-4 h-4 transition-opacity duration-300',
            isDark ? 'opacity-40 text-muted-foreground' : 'opacity-0',
          )}
          strokeWidth={2}
        />
        <Moon
          className={cn(
            'absolute right-2 w-4 h-4 transition-opacity duration-300',
            isDark ? 'opacity-0' : 'opacity-40 text-muted-foreground',
          )}
          strokeWidth={2}
        />
        {/* Thumb */}
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn(
            'relative z-10 flex items-center justify-center w-7 h-7 rounded-full shadow-md',
            isDark
              ? 'ml-auto bg-primary text-primary-foreground'
              : 'mr-auto bg-card text-foreground',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="inline-flex"
            >
              {isDark ? <Moon className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Sun className="w-3.5 h-3.5" strokeWidth={2.5} />}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </button>
    );
  }

  // Icon variant — premium animated circular button
  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn(
        'relative inline-flex items-center justify-center w-10 h-10 rounded-full overflow-hidden',
        'bg-secondary text-foreground hover:bg-secondary/70',
        'dark:bg-card dark:hover:bg-secondary',
        'transition-colors duration-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {/* Animated radial halo that sweeps across on toggle */}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={`halo-${theme}`}
          aria-hidden
          initial={{ scale: 0, opacity: 0.55 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.55),transparent_70%)]"
        />
      </AnimatePresence>

      {/* Icon morph with spring rotation */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -120, opacity: 0, scale: 0.4, y: 4 }}
          animate={{ rotate: 0, opacity: 1, scale: 1, y: 0 }}
          exit={{ rotate: 120, opacity: 0, scale: 0.4, y: -4 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="relative inline-flex"
        >
          {isDark ? (
            <Moon className="w-[18px] h-[18px] text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" strokeWidth={2} />
          ) : (
            <Sun className="w-[18px] h-[18px] text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" strokeWidth={2} />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
