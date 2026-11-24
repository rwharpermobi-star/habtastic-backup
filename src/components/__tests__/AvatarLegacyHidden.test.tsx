import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Avatar from '../Avatar';

const legacy = 'https://votldorvfuktonwewuhm.supabase.co/storage/v1/object/sign/avatars/abc-123/instant-avatar-def-456.svg?token=x';

describe('Avatar with an old 2D avatar', () => {
  it('shows the initial instead of the old 2D image', () => {
    const { container, getByText } = render(<Avatar url={legacy} name="SlickySlickYo" size={40} />);
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('S')).toBeTruthy();
  });

  it('still shows a 3D preset', () => {
    const { container } = render(<Avatar url="/avatars/presets/black-mid-m1.webp" name="Sam" size={40} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/avatars/presets/black-mid-m1.webp');
  });
});
