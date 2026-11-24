import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { vibrateLight, vibrateSuccess } from "@/lib/haptics";

/**
 * Unified button system for HabTastic AI.
 *
 * Variants (semantic):
 * - default     — Primary CTA. Cyan→purple gradient. Reserve for THE main action per screen
 *                 (Upgrade, Start Habit, Save, Accept Challenge).
 * - secondary   — Soft filled surface. Supporting actions.
 * - outline     — Subtle outlined. Tertiary / dismissive-neutral.
 * - ghost       — Text-only. Toolbar / low-emphasis.
 * - destructive — Danger. Delete / irreversible.
 * - link        — Inline text link.
 *
 * Sizes standardised for one-handed use (min 44px tap target on `default` / `lg`).
 * All variants share height, padding, radius, icon spacing, typography, focus ring.
 *
 * States: enabled · disabled · loading · success (auto flash via `success` prop).
 * Interaction: ripple on press, spring scale, haptic feedback (mobile).
 */
const buttonVariants = cva(
  [
    "relative overflow-hidden isolate select-none",
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-btn text-sm font-semibold tracking-[-0.005em]",
    "ring-offset-background transition-[transform,box-shadow,background,color,filter] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "disabled:bg-muted disabled:text-muted-foreground disabled:border-border",
    "disabled:shadow-none disabled:bg-none disabled:[background-image:none] disabled:[text-shadow:none]",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "gradient-primary text-primary-foreground shadow-md glow-primary",
          "hover:shadow-lg hover:brightness-110",
          "dark:hover:brightness-125",
        ].join(" "),
        secondary: [
          "bg-secondary/70 text-secondary-foreground border border-white/[0.06] shadow-sm backdrop-blur-sm",
          "hover:bg-secondary hover:shadow-md",
          "dark:bg-white/[0.06] dark:hover:bg-white/[0.10] dark:border-white/[0.08]",
        ].join(" "),
        outline: [
          "border border-input bg-transparent text-foreground",
          "hover:bg-primary/10 hover:border-primary hover:text-primary",
          "dark:hover:bg-primary/10 dark:hover:text-primary dark:hover:border-primary",
        ].join(" "),
        ghost: [
          "text-foreground",
          "hover:bg-secondary/60 hover:text-foreground",
          "dark:hover:bg-white/[0.06]",
        ].join(" "),
        destructive: [
          "bg-destructive text-destructive-foreground shadow-sm",
          "hover:bg-destructive/90 hover:shadow-md",
          "dark:hover:bg-destructive/85",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline focus-visible:underline",
      },
      size: {
        default: "h-11 px-5 py-2 min-w-[44px]",
        sm: "h-9 rounded-btn px-3.5 text-[13px]",
        lg: "h-12 rounded-btn px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Show a spinner and disable interactions. */
  loading?: boolean;
  /** Show a checkmark success flash (auto-clears via parent state). */
  success?: boolean;
  /** Disable haptic feedback on press (mobile). */
  noHaptic?: boolean;
  /** Disable the ripple effect. */
  noRipple?: boolean;
}

type Ripple = { id: number; x: number; y: number; size: number };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      success = false,
      noHaptic = false,
      noRipple = false,
      children,
      onClick,
      onPointerDown,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const [ripples, setRipples] = React.useState<Ripple[]>([]);
    const rippleId = React.useRef(0);

    const isDisabled = disabled || loading;

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(e);
      if (isDisabled) return;
      if (!noHaptic) vibrateLight();
      if (!noRipple && !asChild) {
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const id = ++rippleId.current;
        const ripple: Ripple = {
          id,
          x: e.clientX - rect.left - size / 2,
          y: e.clientY - rect.top - size / 2,
          size,
        };
        setRipples((r) => [...r, ripple]);
        window.setTimeout(() => {
          setRipples((r) => r.filter((x) => x.id !== id));
        }, 600);
      }
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    };

    // Success haptic pulse
    const wasSuccess = React.useRef(false);
    React.useEffect(() => {
      if (success && !wasSuccess.current) vibrateSuccess();
      wasSuccess.current = success;
    }, [success]);

    // asChild path: keep it dumb (Radix Slot forwards to a single child).
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        type={type ?? "button"}
        className={cn(
          buttonVariants({ variant, size, className }),
          success && "animate-success-burst",
        )}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        data-success={success || undefined}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        {...props}
      >
        {/* Ripples */}
        <span className="pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-[inherit]">
          {ripples.map((r) => (
            <span
              key={r.id}
              className="absolute rounded-full bg-white/25 dark:bg-white/20"
              style={{
                left: r.x,
                top: r.y,
                width: r.size,
                height: r.size,
                animation: "btn-ripple 600ms ease-out forwards",
              }}
            />
          ))}
        </span>

        {/* Content layer */}
        <span
          className={cn(
            "relative z-[1] inline-flex items-center gap-2 transition-opacity",
            (loading || success) && "opacity-0",
          )}
        >
          {children}
        </span>

        {loading && (
          <span className="absolute inset-0 z-[2] inline-flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="sr-only">Loading</span>
          </span>
        )}
        {success && !loading && (
          <span className="absolute inset-0 z-[2] inline-flex items-center justify-center animate-check-bounce">
            <Check className="h-5 w-5" aria-hidden />
            <span className="sr-only">Success</span>
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
