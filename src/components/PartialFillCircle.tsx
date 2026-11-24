import { STATUS_COLORS } from '@/lib/habitStatus';

interface PartialFillCircleProps {
  /** Diameter in px. */
  size?: number;
  /** Fill ratio 0–1 (defaults to 0.5 for a clean half-circle). */
  ratio?: number;
  /** Override fill color (defaults to partial orange). */
  color?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Half-filled circle indicator for "partial completion" days.
 * Renders as an inline SVG so it scales crisply at any size and is
 * instantly recognisable at a glance — much clearer than a centered dot.
 */
export default function PartialFillCircle({
  size = 14,
  ratio = 0.5,
  color = STATUS_COLORS.partial,
  className = '',
  ariaLabel = 'Partially completed',
}: PartialFillCircleProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  // We fill from the BOTTOM up so users read it as "filling up". A pure half
  // shows as the bottom 50% solid orange, top 50% transparent — over the
  // wrapper's orange ring this reads instantly as "halfway there".
  const fillHeight = clamped * size;
  const fillY = size - fillHeight;
  const id = `partial-clip-${size}-${Math.round(clamped * 100)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={id}>
          <rect x="0" y={fillY} width={size} height={fillHeight} />
        </clipPath>
      </defs>
      {/* Faint base ring for unfilled portion — keeps shape visible on any bg */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 0.5}
        fill="none"
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      {/* Solid filled portion */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 0.5}
        fill={color}
        clipPath={`url(#${id})`}
      />
    </svg>
  );
}
