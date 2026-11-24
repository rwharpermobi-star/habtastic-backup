import { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion, type PanInfo } from 'framer-motion';
import { Check, Pencil, Trash2, Copy, GripVertical } from 'lucide-react';
import { vibrateLight, vibrateSuccess } from '@/lib/haptics';

interface SwipeableHabitProps {
  habitId: string;
  completed: boolean;
  onComplete: (rect: DOMRect) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGripPointerDown?: (e: React.PointerEvent) => void;
  showGrip?: boolean;
  children: ReactNode;
}

const COMPLETE_THRESHOLD = 110; // px to trigger completion on right swipe
const ACTIONS_OPEN_X = -168;    // px offset when action tray is open (left swipe)

export default function SwipeableHabit({
  completed,
  onComplete,
  onEdit,
  onDuplicate,
  onDelete,
  onGripPointerDown,
  showGrip = false,
  children,
}: SwipeableHabitProps) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  // Right-swipe green trail intensity
  const rightGlow = useTransform(x, [0, COMPLETE_THRESHOLD], [0, 1]);
  const leftReveal = useTransform(x, [ACTIONS_OPEN_X, 0], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Right swipe → complete
    if (!completed && (offset > COMPLETE_THRESHOLD || velocity > 700)) {
      const rect = rootRef.current?.getBoundingClientRect();
      vibrateSuccess();
      if (rect) onComplete(rect);
      // Snap back
      x.set(0);
      setOpen(false);
      return;
    }

    // Left swipe → open actions
    if (offset < -60 || velocity < -600) {
      setOpen(true);
      x.set(ACTIONS_OPEN_X);
      vibrateLight();
      return;
    }

    // Otherwise close
    setOpen(false);
    x.set(0);
  };

  const closeActions = () => {
    setOpen(false);
    x.set(0);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Right-swipe completion trail (behind card, left side) */}
      <motion.div
        aria-hidden
        style={{ opacity: rightGlow }}
        className="pointer-events-none absolute inset-0 rounded-card bg-gradient-to-r from-[#16A34A]/40 via-[#16A34A]/25 to-transparent flex items-center pl-5"
      >
        <div className="w-9 h-9 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-lg">
          <Check className="w-5 h-5" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Left-swipe action tray (behind card, right side) */}
      <motion.div
        aria-hidden={!open}
        style={{ opacity: leftReveal }}
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-2 pr-2"
      >
        <button
          onClick={() => { onEdit(); closeActions(); }}
          className="pointer-events-auto w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Edit reminder"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => { onDuplicate(); closeActions(); }}
          className="pointer-events-auto w-11 h-11 rounded-full bg-accent/15 text-accent flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Duplicate habit"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={() => { onDelete(); closeActions(); }}
          className="pointer-events-auto w-11 h-11 rounded-full bg-destructive/15 text-destructive flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Delete habit"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </motion.div>

      {/* Draggable card */}
      <motion.div
        drag={reduced ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: ACTIONS_OPEN_X - 20, right: COMPLETE_THRESHOLD + 40 }}
        dragElastic={0.12}
        onDragEnd={handleDragEnd}
        onClick={open ? closeActions : undefined}
        style={{ x, touchAction: 'pan-y' }}
        className="relative"
      >
        {showGrip && (
          <button
            aria-label="Reorder handle — press and drag"
            onPointerDown={onGripPointerDown}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1 text-muted-foreground/60 hover:text-foreground active:text-primary touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        {children}
      </motion.div>
    </div>
  );
}
