import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';

const SHARE_FILES = [
  'src/components/SocialShareSheet.tsx',
  'src/components/CustomShareCard.tsx',
  'src/components/ReferralLinkCopyCard.tsx',
  'src/components/InviteEarnCard.tsx',
  'src/pages/Referral.tsx',
];

describe('share links', () => {
  it('production origin is a live HabTastic domain', () => {
    expect(['https://habtastic.com', 'https://habtastic-ai.lovable.app']).toContain(PRODUCTION_WEB_ORIGIN);
  });

  it.each(SHARE_FILES)('%s never uses the dead habtastic.lovable.app URL', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/habtastic\.lovable\.app/);
    expect(src).toContain('PRODUCTION_WEB_ORIGIN');
  });
});
