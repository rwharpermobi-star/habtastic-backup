import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import StreakMilestoneBadge from '@/components/StreakMilestoneBadge';

describe('StreakMilestoneBadge hook order', () => {
  it('renders nothing for the 3-day milestone', () => {
    const { container } = render(
      <StreakMilestoneBadge milestone={3} emoji="🔥" message="3 days" onClose={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('does not crash when the milestone prop changes between hidden and shown', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StreakMilestoneBadge milestone={3} emoji="🔥" message="3 days" onClose={onClose} />,
    );
    expect(() =>
      rerender(<StreakMilestoneBadge milestone={7} emoji="🔥" message="7 days" onClose={onClose} />),
    ).not.toThrow();
    expect(() =>
      rerender(<StreakMilestoneBadge milestone={3} emoji="🔥" message="3 days" onClose={onClose} />),
    ).not.toThrow();
  });
});
