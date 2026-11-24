import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// ---- Module-level pub/sub ---------------------------------------------------

export interface FlyPayload {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  xp: number;
  coins: number;
}

type Listener = (p: FlyPayload) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/**
 * Emit a flying-reward animation from a source rect to the element with the
 * given `targetId`. Silently no-ops if the target isn't mounted.
 */
export function flyReward(fromRect: DOMRect, opts: { xp: number; coins: number; targetId?: string }) {
  const target = document.getElementById(opts.targetId ?? 'habits-xp-target');
  if (!target) return;
  const toRect = target.getBoundingClientRect();
  const payload: FlyPayload = {
    id: nextId++,
    fromX: fromRect.left + fromRect.width / 2,
    fromY: fromRect.top + fromRect.height / 2,
    toX: toRect.left + toRect.width / 2,
    toY: toRect.top + toRect.height / 2,
    xp: opts.xp,
    coins: opts.coins,
  };
  listeners.forEach(l => l(payload));

  window.setTimeout(() => {
    target.classList.remove('animate-chip-pop');
    void (target as HTMLElement).offsetWidth;
    target.classList.add('animate-chip-pop');
  }, 700);
}

// ---- Layer ------------------------------------------------------------------

export default function FlyingRewardLayer() {
  const [active, setActive] = useState<FlyPayload[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const l: Listener = (p) => {
      setActive(prev => [...prev, p]);
      window.setTimeout(() => {
        setActive(prev => prev.filter(x => x.id !== p.id));
      }, 900);
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <AnimatePresence>
        {active.map(p => {
          const dx = p.toX - p.fromX;
          const dy = p.toY - p.fromY;
          const arc = Math.min(-60, dy / 3 - 40);
          return (
            <motion.div
              key={p.id}
              initial={{ x: p.fromX, y: p.fromY, opacity: 0, scale: 0.7 }}
              animate={
                reduced
                  ? { x: p.toX, y: p.toY, opacity: [0, 1, 0], scale: 1 }
                  : {
                      x: [p.fromX, p.fromX + dx * 0.55, p.toX],
                      y: [p.fromY, p.fromY + arc, p.toY],
                      opacity: [0, 1, 1, 0],
                      scale: [0.7, 1.15, 0.85],
                    }
              }
              transition={{ duration: reduced ? 0.35 : 0.85, ease: [0.22, 1, 0.36, 1], times: reduced ? undefined : [0, 0.15, 0.75, 1] }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ willChange: 'transform, opacity' }}
            >
              <div className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-gradient-to-r from-primary to-accent text-primary-foreground text-caption font-bold shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.7)]">
                <span>+{p.xp} XP</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
