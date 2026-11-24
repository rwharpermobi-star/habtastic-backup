import { describe, expect, it } from 'vitest';
import {
  parseRewardStatus,
  startRefusalMessage,
  waitForRewardGrant,
  winstonDailyLimit,
  WINSTON_AD_DAILY_VIEWS,
  WINSTON_AD_REWARD_MESSAGES,
} from '@/lib/winstonAdReward';

const noSleep = { sleep: async () => {} };

describe('Winston rewarded-ad messages', () => {
  it('each verified ad adds 3 messages, up to 3 ads a day', () => {
    expect(WINSTON_AD_REWARD_MESSAGES).toBe(3);
    expect(WINSTON_AD_DAILY_VIEWS).toBe(3);
  });

  it('daily limit is the 5 free messages plus the verified bonus', () => {
    expect(winstonDailyLimit(5, 0)).toBe(5);
    expect(winstonDailyLimit(5, 3)).toBe(8);
    expect(winstonDailyLimit(5, 9)).toBe(14);
    expect(winstonDailyLimit(5, -4)).toBe(5);
  });

  it('reads server status and defaults missing values safely', () => {
    expect(parseRewardStatus({ session_status: 'granted', views_left: 2, bonus_today: 3, per_view: 3 })).toMatchObject({
      sessionStatus: 'granted', viewsLeft: 2, bonusToday: 3, perView: 3,
    });
    expect(parseRewardStatus(null)).toMatchObject({ sessionStatus: null, viewsLeft: 0, bonusToday: 0 });
    expect(parseRewardStatus({ session_status: 'hacked' }).sessionStatus).toBeNull();
  });

  it('messages are only added once the server confirms Google verified the view', async () => {
    const seen = ['pending', 'pending', 'granted'] as const;
    let i = 0;
    await expect(waitForRewardGrant(async () => seen[i++], noSleep)).resolves.toBe('granted');
    expect(i).toBe(3);
  });

  it('a refused or expired view reports rejected', async () => {
    await expect(waitForRewardGrant(async () => 'rejected', noSleep)).resolves.toBe('rejected');
    await expect(waitForRewardGrant(async () => 'expired', noSleep)).resolves.toBe('rejected');
  });

  it('stays pending (no grant) when Google never confirms', async () => {
    let calls = 0;
    await expect(waitForRewardGrant(async () => { calls++; return 'pending'; }, { attempts: 4, ...noSleep })).resolves.toBe('pending');
    expect(calls).toBe(4);
  });

  it('daily cap and Premium refusals have clear messages', () => {
    expect(startRefusalMessage('daily_cap')).toMatch(/tomorrow/);
    expect(startRefusalMessage('premium')).toMatch(/unlimited/);
  });
});
